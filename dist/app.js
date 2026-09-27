import { analyzeScreenshot } from "./solver.js";

const input = document.querySelector("#screenshot-input");
const canvas = document.querySelector("#result-canvas");
const context = canvas.getContext("2d");
const status = document.querySelector("#status");
const emptyState = document.querySelector("#empty-state");
const resultContent = document.querySelector("#result-content");
const errorBox = document.querySelector("#error-box");
const errorMessage = document.querySelector("#error-message");
const answerList = document.querySelector("#answer-list");
const downloadButton = document.querySelector("#download-button");

let currentFilename = "meowdoku-answer.png";

function setStatus(label, state) {
  status.textContent = label;
  status.dataset.state = state;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("圖片格式無法讀取"));
    };
    image.src = url;
  });
}

function imageDataFor(image) {
  const analysisCanvas = document.createElement("canvas");
  const maxWidth = 700;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  analysisCanvas.width = Math.round(image.naturalWidth * scale);
  analysisCanvas.height = Math.round(image.naturalHeight * scale);
  const analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true });
  analysisContext.drawImage(image, 0, 0, analysisCanvas.width, analysisCanvas.height);
  return {
    imageData: analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height),
    scale,
  };
}

function drawAnswer(image, analysis, scale) {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  context.drawImage(image, 0, 0);

  const radius = Math.max(12, (analysis.step * 0.25) / scale);
  const outline = Math.max(3, radius * 0.14);
  const safeInset = radius + outline + 2;
  context.textAlign = "center";
  context.textBaseline = "middle";

  analysis.clicks.forEach((point, index) => {
    const label = String(index + 1);
    const x = Math.max(safeInset, Math.min(canvas.width - safeInset, point.x / scale));
    const y = Math.max(safeInset, Math.min(canvas.height - safeInset, point.y / scale));
    context.save();
    context.shadowColor = "rgba(40, 33, 38, 0.28)";
    context.shadowBlur = radius * 0.35;
    context.shadowOffsetY = radius * 0.12;
    context.fillStyle = "#ff765f";
    context.strokeStyle = "#fffdf9";
    context.lineWidth = outline;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();

    context.fillStyle = "#282126";
    const fontScale = label.length > 1 ? 0.72 : 0.94;
    context.font = `850 ${Math.round(radius * fontScale)}px ui-rounded, system-ui, sans-serif`;
    context.fillText(label, x, y + 1);
  });
}

function renderList(analysis) {
  answerList.replaceChildren();
  analysis.columns.forEach((column, row) => {
    const item = document.createElement("li");
    item.textContent = `第 ${row + 1} 列 → 第 ${column + 1} 格`;
    answerList.append(item);
  });
}

input.addEventListener("change", async () => {
  const [file] = input.files;
  if (!file) return;

  setStatus("正在辨識", "working");
  emptyState.hidden = true;
  resultContent.hidden = true;
  errorBox.hidden = true;

  try {
    const image = await loadImage(file);
    const { imageData, scale } = imageDataFor(image);
    const analysis = analyzeScreenshot(imageData);
    drawAnswer(image, analysis, scale);
    renderList(analysis);

    currentFilename = `${file.name.replace(/\.[^.]+$/, "")}-answer.png`;
    resultContent.hidden = false;
    setStatus(`${analysis.size}×${analysis.size} · 已解出`, "done");
  } catch (error) {
    errorMessage.textContent = `${error.message}。請確認截圖包含完整彩色棋盤，而且盤面上還沒有放置貓咪。`;
    errorBox.hidden = false;
    setStatus("辨識失敗", "error");
  }
});

downloadButton.addEventListener("click", () => {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    link.download = currentFilename;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, "image/png");
});
