import puppeteer, { ElementHandle } from "puppeteer";

interface ICell {
  status: string;
  x: number;
  y: number;
  minesAround: number | undefined;
  possibility: number;
}

// Функция для получения состояния клеток
const getGameState = async (cellsElements: ElementHandle<Element>[]) => {
  const state = await Promise.all(
    cellsElements.map(async (cellElement) => {
      const status = await cellElement.evaluate(
        (cell) => Array.from(cell.classList.values())[2]
      );
      const x = Number(
        await cellElement.evaluate(
          (cell) => cell.attributes.getNamedItem("data-x")?.value
        )
      );
      const y = Number(
        await cellElement.evaluate(
          (cell) => cell.attributes.getNamedItem("data-y")?.value
        )
      );

      const minesCount = await cellElement.evaluate((cell) => {
        const quantityClass = Array.from(cell.classList.values()).at(3);
        if (!quantityClass) return undefined;
        return quantityClass.at(-1);
      });

      return {
        status,
        x,
        y,
        minesAround: minesCount ? Number(minesCount) : undefined,
        possibility: 0,
      };
    })
  );

  return state;
};

const calculateProbabilities = (cells: ICell[]) => {
  const cellsMap = new Map<string, ICell>();
  let totalCoveredCells = 0;

  cells.forEach((cell) => {
    cellsMap.set(`${cell.x},${cell.y}`, cell);
    if (cell.status !== "hdd_opened") totalCoveredCells++;
  });

  cells.forEach((cell) => {
    if (cell.minesAround === undefined || cell.status !== "hdd_opened") return;

    const neighbors = [
      { x: -1, y: -1 },
      { x: -1, y: 0 },
      { x: -1, y: 1 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];

    const coveredNeighbors = neighbors
      .map(({ x, y }) => cellsMap.get(`${cell.x + x},${cell.y + y}`))
      .filter((neighbor) => neighbor && neighbor.status !== "hdd_opened");

    const minesToFind = cell.minesAround;
    const totalCovered = coveredNeighbors.length;

    if (totalCovered > 0) {
      coveredNeighbors.forEach((neighbor) => {
        if (!neighbor) return;
        neighbor.possibility += minesToFind / totalCovered;
      });
    }
  });

  return Array.from(cellsMap.values());
};

// Основная функция
const main = async (gameurl: string) => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(gameurl, { waitUntil: "networkidle2" });
  await page.waitForSelector("#AreaBlock");
  await page.click("#top_area_face", { delay: 1000 }); // Начало игры
  await page.waitForNetworkIdle();

  while (true) {
    await page.waitForSelector(".cell");
    const cellsElements = await page.$$(".cell");
    const cells: ICell[] = await getGameState(cellsElements);

    // Рассчитываем вероятности для каждой ячейки
    const cellsWithProbabilities = calculateProbabilities(cells);

    // Находим клетку с наименьшей вероятностью мины
    const safestCell = cellsWithProbabilities
      .filter((cell) => cell.status !== "hdd_opened" && cell.status !== "mine")
      .reduce((minCell, cell) => {
        return !minCell || cell.possibility < minCell.possibility
          ? cell
          : minCell;
      }, null as ICell | null);

    // Проверка, закончилась ли игр

    if (!safestCell) {
      console.log("No cells available to click.");
      break;
    }

    console.log("Safest Cell:", safestCell);

    const safestCellElement =
      cellsElements[
        safestCell.x + safestCell.y * Math.sqrt(cellsElements.length)
      ];
    await safestCellElement.click({ delay: 1000 });
    await page.waitForNetworkIdle();
  }

  await browser.close();
};

main("https://minesweeper.online/game/4031948548");
