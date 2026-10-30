"""Per-run observations, never model compatibility or hardware rankings."""
import re
import subprocess
import sys


def parse_vm_stat(text):
    page_size = re.search(r'page size of (\d+) bytes', text)
    if not page_size:
        return None
    counters = dict(re.findall(r'^(Pageouts|Swapouts|Compressions):\s+(\d+)\.', text, re.MULTILINE))
    if len(counters) != 3:
        return None
    return {key: int(value) * int(page_size[1]) for key, value in counters.items()}


def system_memory():
    if sys.platform != 'darwin':
        return None
    try:
        result = subprocess.run(['/usr/bin/vm_stat'], capture_output=True, text=True, timeout=2, check=True)
        return parse_vm_stat(result.stdout)
    except (OSError, subprocess.SubprocessError):
        return None


def memory_delta(before, after):
    if before is None or after is None:
        return None
    return {key: max(0, after[key]-before[key]) for key in before}
