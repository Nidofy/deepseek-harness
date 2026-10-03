import {writeFileAtomic} from '@deepseek-ai/dsh-atomic-write';
export function writeAtomic(path, value) {
  return writeFileAtomic(path, value, {mode: 0o600, dirMode: 0o700});
}
