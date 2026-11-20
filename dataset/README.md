# Datasets

* `isl_alphabet_dataset.csv` - original capture (legacy `left_*/right_*` format, signer unknown). It is converted to the canonical layout on load, so it still trains.
* Put every new export from the **Training Studio** here (`isl_alphabet_<signer>_<date>.csv`). `python ml/train.py` reads **all** `*.csv` files in this folder.
* `sequences/` - motion clips (`*.jsonl`) exported from the Training Studio, used by `ml/train_sequence.py`.

Session IDs are namespaced by file name, so two files that both contain `session-1` are not merged into one session.
