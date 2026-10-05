/**
 * Centralized API error string extractor for CommAI frontend.
 * Safely handles strings, arrays of Pydantic validation error objects ([{loc, msg, type}]),
 * and structured error objects ({message, detail, msg}).
 *
 * @param {any} data - Response payload or error object from fetch/catch
 * @param {string} fallback - Default error string if parsing yields empty result
 * @returns {string} Human-readable error message
 */
export const parseApiError = (data, fallback = 'An unexpected error occurred') => {
  if (!data) return fallback;

  // Handle Error instance
  if (data instanceof Error) {
    return parseApiError(data.message, fallback);
  }

  const detail = data.detail || data.error || data.message || data;

  if (typeof detail === 'string') {
    return detail.trim() || fallback;
  }

  if (Array.isArray(detail)) {
    const msgs = detail
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          return item.msg || item.message || JSON.stringify(item);
        }
        return String(item);
      })
      .filter(Boolean);

    return msgs.length > 0 ? msgs.join('; ') : fallback;
  }

  if (typeof detail === 'object') {
    if (detail.msg) return String(detail.msg);
    if (detail.message) return String(detail.message);
    try {
      return JSON.stringify(detail);
    } catch (e) {
      return fallback;
    }
  }

  return String(detail) || fallback;
};

export default parseApiError;
