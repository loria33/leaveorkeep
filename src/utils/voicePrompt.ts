// Short spoken prompts through DaVoice's on-device text-to-speech (Hanna voice).
//
// The voice model (voice-models/raw/model_ex_hanna_light_davoice_ph.dm, ~69 MB)
// ships as a native resource on both platforms instead of a Metro asset: the
// standalone TTS bridge cannot load the URL Metro serves in dev builds, and a
// single copy keeps the download size in check. Xcode copies it into the app
// bundle; android/app/build.gradle adds voice-models/ as a res directory so it
// lands in res/raw.
import { Platform } from 'react-native';
import { DaVoiceTTSInstance } from 'react-native-davoice-tts';
import RNFS from 'react-native-fs';
import { DAVOICE_LICENSE } from '@env';

const MODEL_FILE = 'model_ex_hanna_light_davoice_ph.dm';
// iOS only searches the app bundle for an `asset:/` name (a bare name is taken
// as a filesystem path); Android resolves a bare name through res/raw.
const MODEL_REF = Platform.OS === 'ios' ? `asset:/${MODEL_FILE}` : MODEL_FILE;
// The Android bridge copies the raw resource to the cache dir under this prefix
const ANDROID_CACHE_PREFIX = 'rn_raw_model_ex_hanna_light_davoice_ph_';
// If the finished event never arrives, carry on rather than hang the caller
const SPEAK_TIMEOUT_MS = 4000;

let engine: DaVoiceTTSInstance | null = null;
let enginePromise: Promise<DaVoiceTTSInstance> | null = null;

// Every init writes a fresh timestamped copy of the model into the cache dir
// and never removes the previous ones, so drop the copies left by earlier runs
async function removeStaleAndroidCopies(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const entries = await RNFS.readDir(RNFS.CachesDirectoryPath);
    await Promise.all(
      entries
        .filter(entry => entry.name.startsWith(ANDROID_CACHE_PREFIX))
        .map(entry => RNFS.unlink(entry.path).catch(() => {})),
    );
  } catch {
    // Cache dir unreadable; nothing to clean
  }
}

// Loads the voice once per app run, on first use
function getEngine(): Promise<DaVoiceTTSInstance> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const instance = new DaVoiceTTSInstance();
      if (DAVOICE_LICENSE) {
        try {
          const accepted = await instance.setLicense(DAVOICE_LICENSE);
          if (!accepted) {
            console.warn('[VoicePrompt] DaVoice license key was rejected');
          }
        } catch (licenseError) {
          console.warn(
            '[VoicePrompt] Failed to set DaVoice license',
            licenseError,
          );
        }
      } else {
        console.warn(
          '[VoicePrompt] DAVOICE_LICENSE is not set in src/.env; the voice may not load',
        );
      }
      await removeStaleAndroidCopies();
      // modelExt tells the Android bridge to keep the .dm extension on its cache
      // copy; without it the engine is handed the model as .onnx
      await instance.initTTS({ model: MODEL_REF, modelExt: 'dm' });
      engine = instance;
      return instance;
    })().catch(error => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

/**
 * Speaks `text` and resolves once playback has finished (or after a timeout).
 * Never throws: a prompt that cannot play should not block what follows it.
 */
export async function speakPrompt(text: string): Promise<void> {
  let instance: DaVoiceTTSInstance;
  try {
    instance = await getEngine();
  } catch (error) {
    console.warn('[VoicePrompt] voice failed to load', error);
    return;
  }
  await new Promise<void>(resolve => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe = () => {};
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    try {
      unsubscribe = instance.onFinishedSpeaking(finish);
    } catch {
      // No event emitter: fall back to the timeout below
    }
    timer = setTimeout(finish, SPEAK_TIMEOUT_MS);
    instance.speak(text, 0).catch(error => {
      console.warn('[VoicePrompt] speak failed', error);
      finish();
    });
  });
}

/** Cuts a prompt short, e.g. when the user taps Stop or closes the viewer. */
export function stopPrompt(): void {
  engine?.stopSpeaking().catch(() => {});
}
