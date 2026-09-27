function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function pixel(image, x, y) {
  const px = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const offset = (py * image.width + px) * 4;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
}

function isBoardColor(rgb) {
  const maximum = Math.max(...rgb);
  const minimum = Math.min(...rgb);
  const average = (rgb[0] + rgb[1] + rgb[2]) / 3;
  return maximum - minimum > 28 && average < 245;
}

function scanRowScore(image, y) {
  let colorful = 0;
  let total = 0;
  for (let x = 0; x < image.width; x += 2) {
    if (isBoardColor(pixel(image, x, y))) colorful += 1;
    total += 1;
  }
  return colorful / total;
}

function rowBands(image) {
  const bands = [];
  const startY = Math.floor(image.height * 0.18);
  const endY = Math.floor(image.height * 0.82);
  let start = null;

  for (let y = startY; y < endY; y += 1) {
    const active = scanRowScore(image, y) > 0.55;
    if (active && start === null) start = y;
    if (!active && start !== null) {
      if (y - start >= 4) bands.push({ start, end: y - 1, height: y - start });
      start = null;
    }
  }
  if (start !== null) bands.push({ start, end: endY - 1, height: endY - start });
  return bands;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function findBoardRows(image) {
  const bands = rowBands(image);
  let best = null;

  for (let first = 0; first < bands.length; first += 1) {
    for (let last = first + 5; last < bands.length && last < first + 12; last += 1) {
      const group = bands.slice(first, last + 1);
      const heights = group.map((band) => band.height);
      const typicalHeight = median(heights);
      const centers = group.map((band) => (band.start + band.end) / 2);
      const steps = centers.slice(1).map((center, index) => center - centers[index]);
      const typicalStep = median(steps);
      const heightSpread = Math.max(...heights) - Math.min(...heights);
      const stepSpread = Math.max(...steps) - Math.min(...steps);
      const regular =
        heightSpread <= Math.max(4, typicalHeight * 0.2) &&
        stepSpread <= Math.max(4, typicalStep * 0.15) &&
        typicalStep > typicalHeight &&
        typicalStep < typicalHeight * 1.35;
      if (!regular) continue;

      const size = group.length;
      const boardSize = typicalStep * size;
      const widthMatch = 1 - Math.min(1, Math.abs(boardSize - image.width) / image.width);
      const score = size * 10 + widthMatch * 20 - heightSpread - stepSpread;
      if (!best || score > best.score) {
        best = { group, centers, step: typicalStep, size, boardSize, score };
      }
    }
  }

  if (!best) throw new Error("找不到規則排列的彩色棋盤");
  return best;
}

function patchMedian(image, x, y, radius = 2) {
  const channels = [[], [], []];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const value = pixel(image, x + dx, y + dy);
      for (let channel = 0; channel < 3; channel += 1) {
        channels[channel].push(value[channel]);
      }
    }
  }
  const middle = Math.floor(channels[0].length / 2);
  return channels.map((values) => values.sort((a, b) => a - b)[middle]);
}

function sampleCell(image, centerX, centerY, step) {
  const samples = [];
  for (const yOffset of [-0.22, 0, 0.22]) {
    for (const xOffset of [-0.22, 0, 0.22]) {
      samples.push(patchMedian(image, centerX + xOffset * step, centerY + yOffset * step));
    }
  }

  let medoid = samples[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of samples) {
    const totalDistance = samples.reduce(
      (total, value) => total + distance(candidate, value),
      0,
    );
    if (totalDistance < bestDistance) {
      bestDistance = totalDistance;
      medoid = candidate;
    }
  }
  return medoid;
}

function initialClusters(samples, threshold = 45) {
  const clusters = [];
  for (const sample of samples) {
    let closest = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const cluster of clusters) {
      const candidateDistance = distance(sample, cluster.center);
      if (candidateDistance < closestDistance) {
        closestDistance = candidateDistance;
        closest = cluster;
      }
    }

    if (!closest || closestDistance > threshold) {
      clusters.push({ center: [...sample], samples: [sample] });
    } else {
      closest.samples.push(sample);
      closest.center = closest.center.map(
        (_, channel) =>
          closest.samples.reduce((sum, value) => sum + value[channel], 0) /
          closest.samples.length,
      );
    }
  }
  return clusters;
}

function mergeClosestClusters(clusters, targetCount) {
  while (clusters.length > targetCount) {
    let pair = null;
    let pairDistance = Number.POSITIVE_INFINITY;
    for (let first = 0; first < clusters.length; first += 1) {
      for (let second = first + 1; second < clusters.length; second += 1) {
        const candidateDistance = distance(clusters[first].center, clusters[second].center);
        if (candidateDistance < pairDistance) {
          pairDistance = candidateDistance;
          pair = [first, second];
        }
      }
    }

    const [first, second] = pair;
    const samples = [...clusters[first].samples, ...clusters[second].samples];
    const center = [0, 1, 2].map(
      (channel) => samples.reduce((sum, value) => sum + value[channel], 0) / samples.length,
    );
    clusters[first] = { center, samples };
    clusters.splice(second, 1);
  }
  return clusters;
}

export function solveColorGrid(grid, solutionLimit = 2) {
  const size = grid.length;
  if (!size || grid.some((row) => row.length !== size) || new Set(grid.flat()).size !== size) {
    throw new Error("顏色區域數量和棋盤大小不一致");
  }

  const solutions = [];
  const usedColumns = new Set();
  const usedColors = new Set();
  const columns = [];

  const search = (row) => {
    if (solutions.length >= solutionLimit) return;
    if (row === size) {
      solutions.push([...columns]);
      return;
    }
    for (let column = 0; column < size; column += 1) {
      const color = grid[row][column];
      if (usedColumns.has(column) || usedColors.has(color)) continue;
      if (row > 0 && Math.abs(column - columns[row - 1]) <= 1) continue;

      usedColumns.add(column);
      usedColors.add(color);
      columns.push(column);
      search(row + 1);
      columns.pop();
      usedColors.delete(color);
      usedColumns.delete(column);
    }
  };

  search(0);
  return solutions;
}

export function analyzeScreenshot(image) {
  const board = findBoardRows(image);
  const size = board.size;
  const step = board.step;
  const top = board.centers[0] - step / 2;
  const left = (image.width - board.boardSize) / 2;
  const samples = [];
  const centers = [];

  for (let row = 0; row < size; row += 1) {
    centers[row] = [];
    for (let column = 0; column < size; column += 1) {
      const x = left + (column + 0.5) * step;
      const y = top + (row + 0.5) * step;
      centers[row][column] = { x, y };
      samples.push(sampleCell(image, x, y, step));
    }
  }

  const clusters = mergeClosestClusters(initialClusters(samples), size);
  if (clusters.length !== size) throw new Error("無法分辨所有顏色區域");

  const labels = samples.map((sample) => {
    let best = 0;
    for (let index = 1; index < clusters.length; index += 1) {
      if (distance(sample, clusters[index].center) < distance(sample, clusters[best].center)) {
        best = index;
      }
    }
    return best;
  });

  const grid = Array.from({ length: size }, (_, row) =>
    labels.slice(row * size, (row + 1) * size),
  );
  const solutions = solveColorGrid(grid);
  if (solutions.length !== 1) {
    throw new Error(solutions.length === 0 ? "盤面沒有解，可能有格子被遮住" : "盤面不只一個解");
  }

  return {
    size,
    grid,
    columns: solutions[0],
    step,
    board: { left, top, size: board.boardSize },
    clicks: solutions[0].map((column, row) => centers[row][column]),
  };
}
