import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { CONFIG } from "./config";

async function create(wasmPath: string, modelPath: string, delegate: "GPU" | "CPU") {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath);
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath, delegate },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

async function createWithDelegateFallback(wasmPath: string, modelPath: string) {
  try {
    return await create(wasmPath, modelPath, "GPU");
  } catch {
    return create(wasmPath, modelPath, "CPU");
  }
}

/** Create the hand landmarker once per camera session: self-hosted assets first, pinned CDN second. */
export async function createHandLandmarker(): Promise<HandLandmarker> {
  const { wasmPath, modelPath, fallbackWasmPath, fallbackModelPath } = CONFIG.mediapipe;
  try {
    return await createWithDelegateFallback(wasmPath, modelPath);
  } catch (localError) {
    console.warn("Local MediaPipe assets unavailable (run `npm run setup:assets`); using the CDN fallback.", localError);
    try {
      return await createWithDelegateFallback(fallbackWasmPath, fallbackModelPath);
    } catch (cdnError) {
      throw new Error(
        "Could not load the hand tracker. Run `npm run setup:assets` while online, or check your connection.",
        { cause: cdnError },
      );
    }
  }
}
