export async function validatePdf(file: File): Promise<void> {
  if (
    !/^[^\\/]{1,180}\.pdf$/i.test(file.name) ||
    file.name.includes("..") ||
    Array.from(file.name).some((c) => c.charCodeAt(0) < 32)
  )
    throw new Error("ชื่อไฟล์ PDF ไม่ปลอดภัย");
  if (file.type && file.type !== "application/pdf")
    throw new Error("รองรับ PDF เท่านั้น");
  if (file.size < 8 || file.size > 20 * 1024 * 1024)
    throw new Error("PDF ต้องมีขนาดไม่เกิน 20 MB");
  const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (
    Array.from(bytes)
      .map((b) => String.fromCharCode(b))
      .join("") !== "%PDF-"
  )
    throw new Error("เนื้อหาไฟล์ไม่ใช่ PDF");
}
