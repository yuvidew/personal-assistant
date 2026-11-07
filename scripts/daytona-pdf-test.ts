import { Daytona } from "@daytona/sdk";

// Verifies the pieces the Telegram agent relies on: pip install, PDF edit, file
// download from the sandbox, and computer-use screenshots.
// Run: bun --env-file=.env scripts/daytona-pdf-test.ts
const daytona = new Daytona();
const sandbox = await daytona.create({ language: "python", autoStopInterval: 5 });
try {
  const dir = "/home/daytona/files";
  await sandbox.fs.createFolder(dir, "755").catch(() => {});
  const run = async (cmd: string) => {
    const r = await sandbox.process.executeCommand(cmd, dir, undefined, 180);
    console.log(`$ ${cmd.split("\n")[0]}\n  exit=${r.exitCode} ${r.result.trim().slice(0, 300)}`);
    return r;
  };
  await run("pip install -q reportlab pypdf 2>&1 | tail -2");
  await run(`python3 - <<'PY'
from reportlab.pdfgen import canvas
c = canvas.Canvas("rental-agreement.pdf"); c.drawString(72, 700, "FAKE RENTAL AGREEMENT")
c.drawString(72, 120, "Landlord: ____________   Tenant: ____________"); c.save()
PY`);
  await run(`python3 - <<'PY'
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
import io
buf = io.BytesIO(); c = canvas.Canvas(buf); c.setFont("Helvetica-Oblique", 18)
c.drawString(80, 125, "J. Landlord"); c.drawString(340, 125, "A. Tenant"); c.save(); buf.seek(0)
r = PdfReader("rental-agreement.pdf"); ov = PdfReader(buf).pages[0]; w = PdfWriter()
p = r.pages[0]; p.merge_page(ov); w.add_page(p); w.write("rental-agreement-signed.pdf")
PY`);
  const out = await sandbox.fs.downloadFile(`${dir}/rental-agreement-signed.pdf`);
  console.log("downloaded signed pdf bytes:", out.byteLength, "header:", out.subarray(0, 5).toString());

  await sandbox.computerUse.start();
  const shot = await sandbox.computerUse.screenshot.takeCompressed({ format: "jpeg", quality: 60, scale: 0.6 });
  console.log("screenshot base64 chars:", shot.screenshot?.length);
} finally {
  await daytona.delete(sandbox);
  console.log("sandbox deleted");
}
