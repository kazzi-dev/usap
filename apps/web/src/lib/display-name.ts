const KEY = "usap:name";

// localStorage can throw (private mode, blocked storage), so never let it break the app.
export function loadDisplayName(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveDisplayName(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // ignore
  }
}
