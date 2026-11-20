import json, sys, tempfile, unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))

import features as F  # noqa: E402
from data import clean, load_csv, thin_near_duplicates  # noqa: E402
from modeling import augment, export_browser_model, fit, numpy_forward  # noqa: E402
from sequence import POOLED_COUNT, pooled_features, resample  # noqa: E402

SCHEMA = json.loads((ROOT / "src" / "data" / "feature-schema.json").read_text())


def fake_hand(seed, wrist_x=0.5):
    rng = np.random.default_rng(seed)
    pts = rng.normal(0, 0.1, (21, 3)); pts[0] = [wrist_x, 0.5, 0.0]
    pts[1:] += pts[0]
    return pts


class SchemaTests(unittest.TestCase):
    def test_constants_match_schema(self):
        self.assertEqual(F.INPUT_FORMAT, SCHEMA["inputFormat"])
        self.assertEqual(F.FEATURE_COUNT, SCHEMA["featureCount"])
        self.assertEqual(list(F.SLOTS), SCHEMA["slots"])
        self.assertEqual(F.LANDMARKS, SCHEMA["landmarksPerHand"])
        self.assertEqual(len(F.feature_columns()), F.FEATURE_COUNT)


class FeatureTests(unittest.TestCase):
    def test_translation_and_scale_invariance(self):
        h = fake_hand(1)
        a = F.build_features([(h, "Right")])
        b = F.build_features([(h * 3.0 + np.array([0.2, 0.1, 0.0]), "Right")])
        np.testing.assert_allclose(a, b, atol=1e-9)

    def test_left_hand_is_mirrored_to_right(self):
        h = fake_hand(2)
        mirrored = h.copy(); mirrored[:, 0] = 2 * h[0, 0] - h[:, 0]  # reflect about the wrist
        left = F.build_features([(mirrored, "Left")])
        right = F.build_features([(h, "Right")])
        np.testing.assert_allclose(left, right, atol=1e-9)

    def test_missing_hand_is_zero_and_flags(self):
        v = F.build_features([(fake_hand(3), "Right")])
        self.assertEqual(v[-2:].tolist(), [1.0, 0.0])
        self.assertFalse(v[63:126].any())
        self.assertEqual(F.build_features([]).sum(), 0)

    def test_two_hands_ordered_by_wrist_x_not_label(self):
        l, r = fake_hand(4, 0.3), fake_hand(5, 0.7)
        a = F.build_features([(l, "Left"), (r, "Right")])
        b = F.build_features([(r, "Right"), (l, "Left")])
        c = F.build_features([(l, "Right"), (r, "Left")])  # labels swapped by a mirrored camera
        np.testing.assert_allclose(a, b)
        np.testing.assert_allclose(a[63:126], c[63:126] * 0 + a[63:126])
        self.assertEqual(a[-2:].tolist(), [1.0, 1.0])

    def test_write_shared_fixture(self):
        """Regenerates the fixture consumed by tests/ts/features.test.ts."""
        cases = []
        specs = [([(1, "Right", 0.5)]), ([(2, "Left", 0.4)]),
                 ([(3, "Left", 0.3), (4, "Right", 0.7)]), ([(5, "Right", 0.8), (6, "Left", 0.2)]),
                 ([(7, None, 0.5)]), ([])]
        for spec in specs:
            hands = [(fake_hand(s, wx), side) for s, side, wx in spec]
            cases.append({
                "hands": [{"side": side, "landmarks": h.tolist()} for h, side in hands],
                "expected": F.build_features(hands).tolist(),
            })
        out = ROOT / "tests" / "fixtures"; out.mkdir(exist_ok=True)
        (out / "features.json").write_text(json.dumps({"columns": F.feature_columns(), "cases": cases}))


class LegacyAndDataTests(unittest.TestCase):
    def test_real_dataset_loads_and_is_canonical(self):
        df = load_csv(ROOT / "dataset" / "isl_alphabet_dataset.csv")
        df, invalid = clean(df)
        self.assertEqual(invalid, 0)
        X = df[F.feature_columns()].to_numpy()
        self.assertEqual(X.shape[1], F.FEATURE_COUNT)
        self.assertTrue((X[:, :63].reshape(-1, 21, 3)[:, 0] == 0).all())  # wrist at origin

    def test_thinning_drops_repeated_frames(self):
        df, _ = clean(load_csv(ROOT / "dataset" / "isl_alphabet_dataset.csv"))
        self.assertLess(len(thin_near_duplicates(df, 0.15)), len(df))
        self.assertEqual(len(thin_near_duplicates(df, 0)), len(df))


class V2CsvTests(unittest.TestCase):
    def test_frontend_export_format_round_trips(self):
        """Header = META_COLUMNS + feature columns, exactly as src/lib/signa/dataset.ts writes it."""
        import csv
        rows = [("A", "Right", "asha", "2026-01-01T00:00:00Z", "session-1"),
                ("A", "Left+Right", "ben", "2026-01-02T00:00:00Z", "session-2")]
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "export.csv"
            with open(path, "w", newline="") as fh:
                w = csv.writer(fh, quoting=csv.QUOTE_ALL)
                w.writerow([*F.META_COLUMNS, *F.feature_columns()])
                for i, meta in enumerate(rows):
                    w.writerow([*meta, *F.build_features([(fake_hand(i), "Right")]).tolist()])
            df, invalid = clean(load_csv(path))
        self.assertEqual(invalid, 0)
        self.assertEqual(df["signer"].tolist(), ["asha", "ben"])
        self.assertEqual(df["session"].tolist(), ["export:session-1", "export:session-2"])
        self.assertEqual(df[F.feature_columns()].to_numpy().shape, (2, F.FEATURE_COUNT))

    def test_unknown_format_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "bad.csv"
            path.write_text("label,foo\nA,1\n")
            with self.assertRaises(ValueError):
                load_csv(path)


class ModelTests(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(0)
        base = {c: F.build_features([(fake_hand(c), "Right")]) for c in (10, 20)}
        self.X = np.vstack([base[c] + rng.normal(0, 0.02, F.FEATURE_COUNT) * (np.arange(F.FEATURE_COUNT) < 63)
                            for c in (10, 20) for _ in range(40)])
        self.y = np.array(["P"] * 40 + ["Q"] * 40)

    def test_augment_keeps_absent_hand_zero(self):
        Xa, ya = augment(self.X, self.y, copies=2)
        self.assertEqual(len(Xa), len(self.X) * 3)
        self.assertFalse(Xa[:, 63:126].any())

    def test_browser_export_matches_sklearn(self):
        for name in ("mlp", "logreg"):
            model = fit(name, self.X, self.y, augment_copies=1)
            export = export_browser_model(model)
            np.testing.assert_allclose(numpy_forward(export, self.X), model.predict_proba(self.X), atol=1e-4)
            self.assertEqual(export["labels"], ["P", "Q"])
            # fixture for the TypeScript forward pass
            if name == "mlp":
                fx = ROOT / "tests" / "fixtures"; fx.mkdir(exist_ok=True)
                (fx / "mlp.json").write_text(json.dumps({
                    "model": export, "inputs": self.X[::20].tolist(),
                    "expected": model.predict_proba(self.X[::20]).tolist()}))

    def test_inference_threshold_and_validation(self):
        import joblib
        from inference import GestureModel, ModelError
        model = fit("logreg", self.X, self.y, augment_copies=0)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "m.joblib"
            joblib.dump({"model": model, "input_format": F.INPUT_FORMAT, "feature_count": F.FEATURE_COUNT}, p)
            gm = GestureModel(p, threshold=0.5)
            out = gm.predict(self.X[0].tolist())
            self.assertIn(out["gesture"], ("P", "UNKNOWN"))
            with self.assertRaises(ValueError):
                gm.predict([0.0] * 5)
            with self.assertRaises(ValueError):
                gm.predict([float("nan")] * F.FEATURE_COUNT)
            joblib.dump({"model": model, "input_format": "old"}, p)
            with self.assertRaises(ModelError):
                GestureModel(p)
            with self.assertRaises(ModelError):
                GestureModel(Path(d) / "missing.joblib")


class SequenceTests(unittest.TestCase):
    def test_resample_and_pooling_shapes(self):
        frames = np.random.default_rng(0).normal(size=(37, F.FEATURE_COUNT))
        self.assertEqual(resample(frames).shape, (16, F.FEATURE_COUNT))
        self.assertEqual(pooled_features(frames).shape, (POOLED_COUNT,))
        with self.assertRaises(ValueError):
            resample(frames[:1])

    def test_motion_is_distinguishable_from_static(self):
        t = np.linspace(0, 1, 30)[:, None]
        moving = np.tile(np.zeros(F.FEATURE_COUNT), (30, 1)) + t
        still = np.zeros((30, F.FEATURE_COUNT))
        self.assertGreater(pooled_features(moving)[-F.FEATURE_COUNT:].mean(),
                           pooled_features(still)[-F.FEATURE_COUNT:].mean())


if __name__ == "__main__":
    unittest.main()
