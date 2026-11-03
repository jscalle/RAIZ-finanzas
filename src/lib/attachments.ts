// Client-side checks for what can be sent to the assistant. They mirror the server
// (server/assistantMedia.ts): the server decides from the file's bytes, this only gives a
// friendly answer before uploading.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type AttachmentKind = 'image' | 'audio';

export type AttachmentCheck =
  | { ok: true; kind: AttachmentKind; mime: string }
  | { ok: false; message: string };

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/heic']);
const AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
]);

const ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
};

const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
};

const UNSUPPORTED_AUDIO_EXTENSIONS = new Set([
  'opus',
  'ogg',
  'oga',
  'mp3',
  'flac',
  'aiff',
  'aif',
]);

const NOT_SUPPORTED_AUDIO =
  'Ese formato de audio todavía no lo puedo leer (por ejemplo las notas de voz de WhatsApp o los MP3). Graba la nota aquí mismo o usa un audio M4A o WAV.';

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

export function validateAttachmentFile(file: {
  name: string;
  type: string;
  size: number;
}): AttachmentCheck {
  if (file.size <= 0)
    return { ok: false, message: 'Ese archivo está vacío. Elige otro.' };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      message: 'El archivo pesa más de 10 MB. Prueba con uno más liviano.',
    };
  }

  const declared = file.type.split(';')[0].trim().toLowerCase();
  const extension = extensionOf(file.name);
  if (declared.startsWith('video/')) {
    return {
      ok: false,
      message: 'Por ahora no puedo leer video. Envía una foto o un audio.',
    };
  }
  if (
    UNSUPPORTED_AUDIO_EXTENSIONS.has(extension) &&
    !AUDIO_MIMES.has(ALIASES[declared] ?? declared)
  ) {
    return { ok: false, message: NOT_SUPPORTED_AUDIO };
  }

  const mime = ALIASES[declared] ?? (declared || BY_EXTENSION[extension] || '');
  if (IMAGE_MIMES.has(mime)) return { ok: true, kind: 'image', mime };
  if (AUDIO_MIMES.has(mime)) return { ok: true, kind: 'audio', mime };
  if (mime.startsWith('audio/'))
    return { ok: false, message: NOT_SUPPORTED_AUDIO };
  return {
    ok: false,
    message:
      'No puedo leer ese tipo de archivo. Usa una foto (JPG, PNG o HEIC) o un audio.',
  };
}

/** The base64 payload of a file, without the "data:...;base64," prefix. */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** A file the user picked and that passed the checks, waiting to be sent. */
export interface PickedAttachment {
  file: File;
  kind: AttachmentKind;
  mime: string;
  /** Object URL for a photo preview; revoke it when the attachment goes away. */
  previewUrl?: string;
}
