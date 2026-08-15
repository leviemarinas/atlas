/**
 * Single browser download helper shared by every module that exports a file.
 * Keeping one implementation stops workspaces from silently shipping without
 * a download function in scope.
 */
export function downloadFile(filename, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
