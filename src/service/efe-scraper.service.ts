// Util
import { Puppeteer, Cheerio, P, S } from '../util/util';
// Model
import {
  Computer, Processor, Price,
  ComputerDimension, ScreenDimension,
  Screen, Disk, ComputerMemory,
  GraphicMemory, DiskMemory, Graphic,
  Input, Keyboard, WebCam
} from '../model/model';
// Interface
import { DatasetInterface, ScraperInterface } from '../interface/interface';
// Enum
import { Company, LoggerType, ComputerType, Brand, ScreenType, GraphicType, Currency } from '../enum/enum';
// Service
import { LoggerService } from './service';


export class EfeScraperService implements ScraperInterface {


  logger: LoggerService;
  company: Company;
  dataset: DatasetInterface;
  link: string = 'https://www.efe.com.pe/efe/computo';


  constructor() {

    this.logger = new LoggerService(LoggerType.EfeScraperLogger);

    this.dataset = {
      computerList: [],
      computerDimensionList: [],
      computerMemoryList: [],
      screenList: [],
      screenDimensionList: [],
      graphicList: [],
      graphicMemoryList: [],
      diskList: [],
      diskMemoryList: [],
      processorList: [],
      inputList: [],
      keyboardList: [],
      webcamList: [],
      priceList: [],
    }

    this.company = Company.Efe;

  }

  async scrap(): Promise<DatasetInterface> {

    try {

      this.logger.report('Inicializando el navegador');
      const browser = await Puppeteer.launch({ headless: false, defaultViewport: null });
      const [catalogPage] = await browser.pages();

      this.logger.report('Ingresando al catalogo de productos');
      await catalogPage.goto(this.link, { waitUntil: 'networkidle2', timeout: 0 });
      await catalogPage.waitForTimeout(2000);

      this.logger.report('Recorriendo lista de computadoras');
      const computerCardList = await catalogPage.$$('div.product_name a[href]');
      const computerCardLimit = 15;

      for (let computerCardIndex = 0; computerCardIndex < computerCardList.length; computerCardIndex++) {

        if (P.equals(computerCardIndex, computerCardLimit)) break;

        this.logger.report('Ingresando a los detalles del producto #' + (computerCardIndex + 1));
        await computerCardList[computerCardIndex].click({ button: 'middle' });

        const productPage = P.last(await browser.pages());
        await productPage.bringToFront();
        await productPage.waitForTimeout(15000);

        this.logger.report('Empezando la extraccion de datos...');
        const productHTML = await productPage.content();
        const $ = Cheerio.load(productHTML);

        const getTableValueByItem = (name: string) => {
          const detailList = $('div.product_page_content div.tab div.content ul').children();
          return $(detailList).filter((_i, el) => P.equals($(el).children().first().text().trim(), name + ':')).first().children().last().text().trim();
        };

        const computer = {
          id: S.generateId(),
          sku: P.last($('span.sku').text().split(':')),
          name: $('h1.main_header').text().trim(),
          type: getTableValueByItem('Tipo').split(/\s+/)[0] as ComputerType,
          brand: P.convertStringToNameCase($('div.Manufacturer').first().text().trim(), 'PascalCase') as Brand,
          model: getTableValueByItem('Modelo'),
          os: getTableValueByItem('Sistema operativo'),
          warranty: P.isDefined(getTableValueByItem('Garantía')),
          warrantyTime: getTableValueByItem('Garantía'),
          url: productPage.url(),
          company: this.company,
        } as Computer;

        const computerDimension = {
          id: S.generateId(),
          heightCm: getTableValueByItem('Costado')?.split(/\s+/)[0] || getTableValueByItem('Dimensiones')?.replace('cm', '').split('x')[1]?.trim(),
          widthCm: getTableValueByItem('Ancho')?.split(/\s+/)[0] || getTableValueByItem('Dimensiones')?.replace('cm', '').split('x')[0]?.trim(),
          thickCm: getTableValueByItem('Alto')?.split(/\s+/)[0] || getTableValueByItem('Profundidad')?.split(/\s+/)[0] || getTableValueByItem('Dimensiones')?.replace('cm', '').split('x')[2]?.trim(),
          weightKg: getTableValueByItem('Peso (kg)').split(/\s+/)[0],
          computerId: computer.id,
        } as ComputerDimension;

        const computerMemory = {
          id: S.generateId(),
          capacityGB: getTableValueByItem('Memoria RAM').split(/\s+/)[0].trim(),
          expandable: P.equals(getTableValueByItem('Memoria ampliable'), 'Si'),
          optane: P.equals(getTableValueByItem('Memoria Optane'), 'Si'),
          computerId: computer.id,
        } as ComputerMemory;

        const processor = {
          id: S.generateId(),
          brand: getTableValueByItem('Marca de procesador'),
          generation: getTableValueByItem('Procesador'),
          velocityGHz: getTableValueByItem('Velocidad de procesador').toLocaleLowerCase().split('ghz')[0].trim(),
          maxVelocityGHz: getTableValueByItem('Velocidad máxima').toLocaleLowerCase().split('ghz')[0].trim(),
          coreCount: getTableValueByItem('Núcleos de procesador'),
          name: getTableValueByItem('Marca de procesador') + ' ' + getTableValueByItem('Procesador'),
          computerId: computer.id,
        } as Processor;

        const screen = {
          id: S.generateId(),
          type: ScreenType.IPS,
          definition: getTableValueByItem('Definición'),
          touch: P.equals(getTableValueByItem('Pantalla táctil'), 'Si'),
          computerId: computer.id,
        } as Screen;

        const resolutionRow = getTableValueByItem('Resolución de pantalla') || getTableValueByItem('Resolución') || '';
        const resolutionMatch = resolutionRow.match(/(\d+ x \d+)/g)?.length == 1 ? resolutionRow.match(/(\d+ x \d+)/g)[0] : '';
        const resolutionSplit = resolutionMatch.split('x').length == 2 ? resolutionMatch.split('x') : [null, null];

        const screenDimension = {
          id: S.generateId(),
          sizeInch: S.extractNumbers(getTableValueByItem('Tamaño de pantalla')),
          widthPx: resolutionSplit[0]?.trim(),
          heightPx: resolutionSplit[1]?.trim(),
          screenId: screen.id,
        } as ScreenDimension;

        const disk = {
          id: S.generateId(),
          hdd: P.equals(getTableValueByItem('Disco duro (DD)'), 'Si'),
          ssd: P.equals(getTableValueByItem('Disco estado sólido (SSD)'), 'Si'),
          ssdReader: false,
          allowSecondUnit: P.equals(getTableValueByItem('Permite segunda unidad'), 'Si'),
          allowReplace: P.equals(getTableValueByItem('Permite reemplazo'), 'Si'),
          opticalUnit: P.equals(getTableValueByItem('Unidad óptica'), 'Si'),
          computerId: computer.id,
        } as Disk;

        const diskMemory = {
          id: S.generateId(),
          capacityGB: getTableValueByItem('Capacidad').match(/(\d+\s*GB)/g)?.length == 1 ? getTableValueByItem('Capacidad').match(/(\d+\s*GB)/g)[0].split('GB')[0].trim() : null,
          capacityTB: getTableValueByItem('Capacidad').match(/(\d+\s*TB)/g)?.length == 1 ? getTableValueByItem('Capacidad').match(/(\d+\s*TB)/g)[0].split('TB')[0].trim() : null,
          diskId: disk.id,
        } as DiskMemory;

        const graphic = {
          id: S.generateId(),
          type: P.equals(getTableValueByItem('Tipo de gráficos'), 'DEDICADO') ? GraphicType.Dedicated : GraphicType.Integrated,
          brand: getTableValueByItem('Marca tarjeta gráfica'),
          name: getTableValueByItem('Tarjeta gráfica'),
          computerId: computer.id,
        } as Graphic;

        const graphicMemory = {
          id: S.generateId(),
          capacityGB: getTableValueByItem('Memoria Gráfica')?.split(/\s+/)[0].trim(),
          graphicId: graphic.id,
        } as GraphicMemory;

        const input = {
          id: S.generateId(),
          wifi: P.equals(getTableValueByItem('Wi-Fi'), 'Si'),
          hdmi: P.equals(getTableValueByItem('HDMI'), 'Si') ?? P.equals(getTableValueByItem('Puertos HDMI'), 'Si'),
          hdmiCount: P.isDefined(getTableValueByItem('HDMI')) ? '1' : null,
          usb2Count: getTableValueByItem('USB 2.0'),
          usb2: P.isDefined(getTableValueByItem('USB 2.0')),
          usb3Count: getTableValueByItem('USB 3.0'),
          usb3: P.isDefined(getTableValueByItem('USB 3.0')),
          usbCCount: getTableValueByItem('USB tipo C'),
          usbC: P.isDefined(getTableValueByItem('USB tipo C')),
          usbCount: getTableValueByItem('Puertos USB'),
          microphone: P.equals(getTableValueByItem('Entrada micrófono'), 'Si'),
          network: P.equals(getTableValueByItem('Puerto de red'), 'Si'),
          vga: P.equals(getTableValueByItem('Conexión VGA'), 'Si'),
          bluetooth: P.equals(getTableValueByItem('Bluetooth'), 'Si'),
          computerId: computer.id,
        } as Input;

        const keyboard = {
          id: S.generateId(),
          illuminated: P.equals(getTableValueByItem('Teclado iluminado'), 'Si'),
          isNumeric: P.equals(getTableValueByItem('Teclado númerico'), 'Si'),
          computerId: computer.id,
        } as Keyboard;

        const webcam = {
          id: S.generateId(),
          included: P.equals(getTableValueByItem('Cámara web'), 'Si'),
          computerId: computer.id,
        } as WebCam;

        const realValue = S.extractNumbers($('span.old_price').first().text().trim());
        const reducedValue = S.extractNumbers($('span#offerPriceValue').first().text().trim());
        const discountValue = P.isDefined(realValue) && P.isDefined(reducedValue) ? Math.round(100 - (P.toFloat(reducedValue) * 100 / P.toFloat(realValue))).toString() : '0';

        const price = {
          id: S.generateId(),
          currency: P.equals($('span#offerPriceSymbol').first().text().trim(), 'S/') ? Currency.PEN : null,
          realValue,
          reducedValue,
          discountValue,
          consulted: new Date().toDateString(),
          computerId: computer.id,
        } as Price;

        this.dataset.computerList.push(computer);
        this.dataset.computerDimensionList.push(computerDimension)
        this.dataset.computerMemoryList.push(computerMemory);
        this.dataset.screenList.push(screen);
        this.dataset.screenDimensionList.push(screenDimension);
        this.dataset.diskList.push(disk);
        this.dataset.diskMemoryList.push(diskMemory);
        this.dataset.graphicList.push(graphic);
        this.dataset.graphicMemoryList.push(graphicMemory);
        this.dataset.processorList.push(processor);
        this.dataset.inputList.push(input);
        this.dataset.keyboardList.push(keyboard);
        this.dataset.webcamList.push(webcam);
        this.dataset.priceList.push(price);

        await productPage.close();

      }

      this.logger.report('Cerrando el navegador');
      await browser.close();

      return this.dataset;

    } catch (error) {

      console.log(error);

      return null;
    }

  }


}