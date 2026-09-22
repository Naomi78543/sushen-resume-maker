/*
 * 酥神简历编辑器 — 位图 → PDF 纯函数生成器（零第三方依赖）
 *
 * 导出 PDF 的底层逻辑：编辑器把分页后的每一张 A4 sheet（.sushen-sheet，内含页边距/
 * 页眉/页脚/页码）渲染成一张高清位图（A4 @2x），本模块把每张位图作为一个 PDF 页面
 * 无损嵌入（/DeviceRGB + /FlateDecode）。
 * 压缩直接用浏览器原生 CompressionStream('deflate')（RFC1950 zlib，PDF FlateDecode
 * 兼容）；极老浏览器无该 API 时退回手写 stored-block zlib（无压缩、文件更大但合法）。
 *
 * 本文件不依赖 DOM，可被浏览器（挂到 window.ResumePdf）与 Node 测试（module.exports）复用。
 */
(function (global) {
  "use strict";

  // A4 竖版尺寸（points，1pt = 1/72in）
  const A4_PT_WIDTH = 595.28;
  const A4_PT_HEIGHT = 841.89;

  // imageData（RGBA）→ 无滤波扫描线 RGB 字节序，PDF /DeviceRGB 需要
  function rgbPixels(imageData) {
    const data = imageData.data;
    const out = new Uint8Array((data.length / 4) * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      out[j] = data[i];
      out[j + 1] = data[i + 1];
      out[j + 2] = data[i + 2];
    }
    return out;
  }

  // RFC1950 zlib + stored（未压缩）DEFLATE 块。只在 CompressionStream 缺失时兜底。
  // 0x7801：CMF=0x78（CM=8/CINFO=7），FLG=0x01（FLEVEL=0），(0x78*256+0x01) % 31 === 0。
  function zlibStored(bytes) {
    const out = new Uint8Array(2 + 5 * Math.max(1, Math.ceil(bytes.length / 65535)) + bytes.length + 4);
    let p = 0;
    out[p++] = 0x78;
    out[p++] = 0x01;
    let pos = 0;
    do {
      const length = Math.min(65535, bytes.length - pos);
      out[p++] = pos + length === bytes.length ? 1 : 0; // BFINAL
      out[p++] = length & 0xff;
      out[p++] = (length >> 8) & 0xff;
      out[p++] = (~length) & 0xff;
      out[p++] = ((~length) >> 8) & 0xff;
      out.set(bytes.subarray(pos, pos + length), p);
      p += length;
      pos += length;
    } while (pos < bytes.length);
    let a = 1, b = 0;
    for (let i = 0; i < bytes.length; i++) {
      a = (a + bytes[i]) % 65521;
      b = (b + a) % 65521;
    }
    // Adler-32 = (sum2 << 16) | sum1，大端序：先 sum2 高字节，后 sum1 低字节
    out[p++] = (b >> 8) & 0xff;
    out[p++] = b & 0xff;
    out[p++] = (a >> 8) & 0xff;
    out[p++] = a & 0xff;
    return p === out.length ? out : out.subarray(0, p);
  }

  // 原生 zlib 压缩（Chrome 80+ / Firefox 113+ / Safari 16.4+）；无 API 时退回 stored
  async function deflateBytes(bytes) {
    if (typeof CompressionStream === "function") {
      const stream = new CompressionStream("deflate");
      const writer = stream.writable.getWriter();
      writer.write(bytes);
      writer.close();
      return new Uint8Array(await new Response(stream.readable).arrayBuffer());
    }
    return zlibStored(bytes);
  }

  // 把 A4 切片像素组装成完整 PDF 文件（Blob）。
  // chunks: [{ width, height, pixels }]，width/height 为像素数，pixels 为 RGB 字节。
  // 每页 MediaBox 宽度固定为 A4 宽（595.28pt），高度按切片与 A4 宽度同比例换算：
  // 每张 A4 sheet(分页引擎已切好)渲染成一张 2x 位图 → 841.89pt(标准 A4)。
  async function buildPdf(chunks) {
    const enc = new TextEncoder();
    const parts = [];
    let size = 0;
    const push = chunk => { parts.push(chunk); size += chunk.length; };
    push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4\n + 二进制标记

    const count = chunks.length;
    const offsets = new Array(count * 3 + 2);
    const beginObject = num => { offsets[num] = size; push(enc.encode(`${num} 0 obj\n`)); };
    const endObject = () => push(enc.encode("endobj\n"));

    beginObject(1); // Catalog
    push(enc.encode("<< /Type /Catalog /Pages 2 0 R >>\n"));
    endObject();

    beginObject(2); // Pages 树
    const kids = Array.from({ length: count }, (_, i) => `${3 + i * 3} 0 R`).join(" ");
    push(enc.encode(`<< /Type /Pages /Count ${count} /Kids [${kids}] >>\n`));
    endObject();

    for (let i = 0; i < count; i++) {
      const chunk = chunks[i];
      const pageNum = 3 + i * 3;
      const imageNum = pageNum + 1;
      const contentsNum = pageNum + 2;
      const pageH = Math.round(chunk.height * (A4_PT_WIDTH / chunk.width) * 100) / 100;

      beginObject(pageNum); // Page
      push(enc.encode(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_PT_WIDTH} ${pageH}] ` +
        `/Resources << /XObject << /Im${i + 1} ${imageNum} 0 R >> >> /Contents ${contentsNum} 0 R >>\n`
      ));
      endObject();

      const compressed = await deflateBytes(chunk.pixels); // 先压缩，Length 需要

      beginObject(imageNum); // 图像 XObject（无损嵌入 PNG 像素，FlateDecode 解码）
      push(enc.encode(
        `<< /Type /XObject /Subtype /Image /Width ${chunk.width} /Height ${chunk.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\n` +
        "stream\n"
      ));
      push(compressed);
      push(enc.encode("\nendstream\n"));
      endObject();

      const content = `q\n${A4_PT_WIDTH} 0 0 ${pageH} 0 0 cm\n/Im${i + 1} Do\nQ\n`;
      beginObject(contentsNum); // 页面内容流（未压缩）
      push(enc.encode(`<< /Length ${enc.encode(content).length} >>\nstream\n`));
      push(enc.encode(content));
      push(enc.encode("endstream\n"));
      endObject();
    }

    const xrefOffset = size;
    const totalObjects = 2 + count * 3;
    push(enc.encode(`xref\n0 ${totalObjects + 1}\n`));
    push(enc.encode("0000000000 65535 f \n"));
    for (let i = 1; i <= totalObjects; i++) {
      push(enc.encode(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`));
    }
    push(enc.encode(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));

    return new Blob(parts, { type: "application/pdf" });
  }

  const api = { A4_PT_WIDTH, A4_PT_HEIGHT, rgbPixels, zlibStored, deflateBytes, buildPdf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.ResumePdf = api;
})(typeof window !== "undefined" ? window : globalThis);