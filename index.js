import express from 'express';
import cors from 'cors';
import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const printer = new ThermalPrinter({
  type: PrinterTypes.EPSON,
  interface: '\\\\localhost\\Printer69',
  characterSet: 'PC858_EURO',
  removeSpecialCharacters: false,
  lineCharacter: '-',
});

app.get('/', (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Printer service is running and ready',
      version: '1.0.0',
    });
  } catch (error) {
    console.error('Error in root route:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error checking printer service status',
    });
  }
});

app.post('/print/receipt', async (req, res) => {
  try {
    const { title, items, total, date, orderNumber } = req.body;

    printer.clear();

    printer.alignCenter();
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(title || 'KAUFBELEG');
    printer.bold(false);
    printer.setTextNormal();
    printer.newLine();

    printer.alignLeft();
    if (orderNumber) {
      printer.println(`Beleg-Nr.: ${orderNumber}`);
    }
    if (date) {
      printer.println(`Datum: ${date}`);
    }
    printer.drawLine();

    if (items && Array.isArray(items)) {
      let hasDiscountItems = false;

      items.forEach(item => {
        try {
          if (
            item.name.includes('Rabatt') ||
            item.name.includes('Gutschrift') ||
            item.name === 'Zahlungsart' ||
            item.name === 'Rückgeld'
          ) {
            hasDiscountItems = true;
            return;
          }

          printer.leftRight(item.name, item.price);
          if (item.description) {
            printer.setTextSize(0, 0);
            printer.println(`  ${item.description}`);
            printer.setTextNormal();
          }
        } catch (itemError) {
          console.error('Error printing item:', itemError, item);
        }
      });

      if (hasDiscountItems) {
        printer.drawLine();
        printer.bold(true);
        printer.leftRight('ZWISCHENSUMME:', total);
        printer.bold(false);

        items.forEach(item => {
          try {
            if (item.name.includes('Rabatt') || item.name.includes('Gutschrift')) {
              printer.leftRight(item.name, item.price);
            }
          } catch (discountError) {
            console.error('Error printing discount item:', discountError, item);
          }
        });

        printer.drawLine();
        items.forEach(item => {
          try {
            if (item.name === 'Zahlungsart') {
              printer.leftRight(item.name, item.price);
            }
          } catch (paymentError) {
            console.error('Error printing payment item:', paymentError, item);
          }
        });

        items.forEach(item => {
          try {
            if (item.name === 'Rückgeld') {
              printer.leftRight(item.name, item.price);
            }
          } catch (changeError) {
            console.error('Error printing change item:', changeError, item);
          }
        });
      }
    }

    printer.drawLine();

    if (total) {
      printer.bold(true);
      printer.setTextSize(0, 1);
      printer.leftRight('GESAMTBETRAG:', total);
      printer.setTextNormal();
      printer.bold(false);
    }

    printer.newLine();
    printer.alignCenter();
    printer.println('Enthaltene MwSt. 19%');

    printer.newLine();
    printer.println('BankLy LLC German Branch');
    printer.println('Mainzer Landstraße 55');
    printer.println('60325 Frankfurt, Germany');

    try {
      printer.newLine();
      printer.alignCenter();
      printer.printQR(`RECEIPT:${orderNumber}`, {
        model: 2,
        cellSize: 6,
        correction: 'M',
      });

      printer.newLine();
      printer.println('Scannen Sie für die digitale Quittung');
      printer.newLine();
    } catch (qrError) {
      console.error('Error printing QR code:', qrError);
    }

    printer.cut();

    try {
      const success = await printer.execute();
      printer.clear();
      res.json({ success, message: 'Beleg erfolgreich gedruckt' });
    } catch (printError) {
      console.error('Error executing print job:', printError);
      res.status(500).json({
        error: printError.message || 'Fehler beim Drucken',
        success: false,
      });
    }
  } catch (error) {
    console.error('Fehler beim Drucken des Belegs:', error);

    let errorMessage = error.message;
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Drucker nicht erreichbar. Bitte überprüfen Sie die Verbindung.';
    } else if (error.code === 'EPERM') {
      errorMessage = 'Keine Berechtigung zum Zugriff auf den Drucker.';
    }

    try {
      printer.clear();
    } catch (clearError) {
      console.error('Error clearing printer after failure:', clearError);
    }

    res.status(500).json({
      error: errorMessage,
      success: false,
    });
  }
});

app.post('/print/deposit', async (req, res) => {
  try {
    const { title, items, total, date, orderNumber } = req.body;

    printer.clear();

    printer.alignCenter();

    printer.alignCenter();
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(title || 'PFANDBON');
    printer.bold(false);
    printer.setTextNormal();
    printer.newLine();

    printer.alignLeft();
    if (orderNumber) {
      printer.println(`Beleg-Nr.: ${orderNumber}`);
    }
    if (date) {
      printer.println(`Datum: ${date}`);
    }
    printer.drawLine();

    if (items && Array.isArray(items)) {
      items.forEach(item => {
        try {
          printer.leftRight(item.name, item.price);
          if (item.description) {
            printer.setTextSize(0, 0);
            printer.println(`  ${item.description}`);
            printer.setTextNormal();
          }
        } catch (itemError) {
          console.error('Error printing item:', itemError, item);
        }
      });
    }

    printer.drawLine();
    if (total) {
      printer.bold(true);
      printer.setTextSize(0, 1);
      printer.leftRight('GESAMTBETRAG:', total);
      printer.setTextNormal();
      printer.bold(false);
    }

    printer.newLine();
    printer.alignCenter();
    printer.println('BankLy LLC German Branch');
    printer.println('Mainzer Landstraße 55');
    printer.println('60325 Frankfurt, Germany');

    try {
      printer.newLine();
      printer.alignCenter();

      let barcodeValue = orderNumber.replace(/\D/g, ''); // Remove non-digits

      if (barcodeValue.length < 12) {
        barcodeValue = barcodeValue.padStart(12, '0');
      } else if (barcodeValue.length > 12) {
        barcodeValue = barcodeValue.substring(0, 12);
      }

      // Enable HRI characters and set position to below barcode
      printer.append(Buffer.from([0x1d, 0x48, 0x02])); // GS H n - HRI position - below barcode
      printer.append(Buffer.from([0x1d, 0x66, 0x00])); // GS f n - HRI font - font A

      printer.printBarcode(orderNumber, 67, {
        hriPos: 2,
        hriFont: 0,
        width: 3,
        height: 100,
      });

      printer.newLine();
    } catch (barcodeError) {
      console.error('Error printing EAN13 barcode:', barcodeError);
    }

    printer.cut();

    try {
      const success = await printer.execute();
      printer.clear();
      res.json({ success, message: 'Pfandbeleg erfolgreich gedruckt' });
    } catch (printError) {
      console.error('Error executing print job:', printError);
      res.status(500).json({
        error: printError.message || 'Fehler beim Drucken',
        success: false,
      });
    }
  } catch (error) {
    console.error('Error printing deposit receipt:', error);

    let errorMessage = error.message;
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Drucker nicht erreichbar. Bitte überprüfen Sie die Verbindung.';
    } else if (error.code === 'EPERM') {
      errorMessage = 'Keine Berechtigung zum Zugriff auf den Drucker.';
    }

    try {
      printer.clear();
    } catch (clearError) {
      console.error('Error clearing printer after failure:', clearError);
    }

    res.status(500).json({
      error: errorMessage,
      success: false,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Printer Service running on port ${PORT}`);
});
