/**
 * Studio's single-file servers. `releases/latest/download/<file>` always serves that file from the newest
 * release, so these links follow each release by themselves, as long as the file names stay the same.
 */
export const RELEASES_URL = 'https://github.com/zerodensity/ograf-studio/releases/latest';

export interface Download {
  /** What the visitor's computer is, as a link reads it. */
  label: string;
  file: string;
  url: string;
}

const download = (label: string, file: string): Download => ({
  label,
  file,
  url: `${RELEASES_URL}/download/${file}`,
});

export const WINDOWS_X64 = download('Windows x64', 'OGrafStudioServer.exe');
export const LINUX_X64 = download('Linux x64', 'OGrafStudioServer-linux-x64');
export const LINUX_ARM64 = download('Linux ARM64', 'OGrafStudioServer-linux-arm64');

export const DOWNLOADS: Download[] = [WINDOWS_X64, LINUX_X64, LINUX_ARM64];
