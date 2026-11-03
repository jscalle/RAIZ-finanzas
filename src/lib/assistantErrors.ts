// Plain-Spanish messages for the error codes of POST /api/assistant/messages.
const GENERIC =
  'Algo salió mal al procesar tu mensaje. Intenta de nuevo en un momento.';

export function describeAssistantError(
  code?: string,
  retryAfterSeconds?: number
): string {
  switch (code) {
    case 'empty_message':
    case 'invalid_body':
      return 'Escribe un mensaje o adjunta una foto o un audio.';
    case 'text_too_long':
      return 'Tu mensaje es muy largo. Acórtalo a menos de 2000 caracteres.';
    case 'attachment_too_large':
    case 'payload_too_large':
      return 'El archivo pesa más de 10 MB. Prueba con uno más liviano.';
    case 'attachment_type_not_allowed':
    case 'attachment_type_mismatch':
    case 'attachment_invalid':
      return 'No puedo leer ese tipo de archivo. Usa una foto (JPG, PNG o HEIC) o un audio.';
    case 'rate_limited': {
      const minutes = Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60));
      return `Enviaste muchos mensajes seguidos. Espera ${minutes} min e intenta de nuevo.`;
    }
    case 'media_quota_exceeded':
      return 'Llegaste al límite de fotos y audios de hoy. Mañana puedes enviar más, o escríbelo en texto.';
    case 'not_a_member':
    case 'space_not_found':
    case 'invalid_space_id':
      return 'No encuentro tu espacio. Revisa "Nube y Compartir".';
    default:
      return GENERIC;
  }
}
