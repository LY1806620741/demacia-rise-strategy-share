export function logDebug(scope, message, details) {
  const prefix = `[${scope}] ${message}`;
  if (details === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, details);
}

export function logWarn(scope, message, details) {
  const prefix = `[${scope}] ${message}`;
  if (details === undefined) {
    console.warn(prefix);
    return;
  }
  console.warn(prefix, details);
}

export function logError(scope, message, details) {
  const prefix = `[${scope}] ${message}`;
  if (details === undefined) {
    console.error(prefix);
    return;
  }
  console.error(prefix, details);
}

