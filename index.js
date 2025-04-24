import express from 'express';
import cors from 'cors';
import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer';

/** @type {import('express').Express} */
const app = express();
/** @const {number} Port the server listens on */
const PORT = 3001;

app.use(cors());
app.use(express.json());

/** @type {ThermalPrinter} Thermal printer instance */
const printer = new ThermalPrinter({
  type: PrinterTypes.EPSON,
  interface: '\\\\localhost\\Printer69', // Adjust this to your printer path
  characterSet: 'WPC1252',
  removeSpecialCharacters: false,
  lineCharacter: '-',
});

/**
 * @route GET /
 * @description Checks the status of the printer service.
 * @returns {object} 200 - Success response with service status.
 * @returns {object} 500 - Error response if status check fails.
 */
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

/**
 * @route POST /print/receipt
 * @description Generates and prints a sales receipt.
 * @param {object} req.body - The receipt data.
 * @param {string} [req.body.title='KAUFBELEG'] - The title of the receipt.
 * @param {Array<object>} req.body.items - Array of items purchased.
 * @param {string} req.body.items[].name - Name of the item.
 * @param {string} req.body.items[].price - Price of the item (formatted string).
 * @param {string} [req.body.items[].description] - Optional description for the item.
 * @param {string} req.body.total - The total amount (formatted string).
 * @param {string} req.body.date - The date of the transaction.
 * @param {string} req.body.orderNumber - The unique order or receipt number.
 * @param {string} [req.body.footerText] - Optional text to print at the bottom.
 * @returns {object} 200 - Success response indicating the receipt was printed.
 * @returns {object} 500 - Error response if printing fails.
 */
app.post('/print/receipt', async (req, res) => {
  try {
    const { title, items, total, date, orderNumber, footerText } = req.body;

    printer.clear();

    // --- Header ---
    printer.alignCenter();
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(title || 'KAUFBELEG');
    printer.bold(false);
    printer.setTextNormal();
    printer.newLine();

    // --- Meta Info ---
    printer.alignLeft();
    printer.setTextSize(0, 0);
    if (orderNumber) {
      printer.println(`Beleg-Nr.: ${orderNumber}`);
    }
    if (date) {
      printer.println(`Datum: ${date}`);
    }
    printer.setTextNormal();
    printer.drawLine();

    // --- Items ---
    if (items && Array.isArray(items)) {
      let hasDiscountItems = false;

      // Print regular items first
      items.forEach(item => {
        try {
          const isDiscountOrMeta =
            item.name.includes('Rabatt') ||
            item.name.includes('Gutschrift') ||
            item.name.toLowerCase() === 'zahlungsart' ||
            item.name.toLowerCase() === 'rückgeld' ||
            item.name.toLowerCase() === 'gegeben';

          if (isDiscountOrMeta) {
            hasDiscountItems = true;
            return; // Skip discount/meta items in this loop
          }

          printer.leftRight(item.name, item.price);
          if (item.description) {
            printer.setTextSize(0, 0);
            printer.println(`  ${item.description}`);
            printer.setTextNormal();
          }
        } catch (itemError) {
          console.error('Error printing item:', itemError, item);
          // Continue printing other items if one fails
        }
      });

      // Print discount/payment details if they exist
      if (hasDiscountItems) {
        printer.drawLine('-'); // Separator before discount/payment details

        items.forEach(item => {
          try {
            const isDiscountOrMeta =
              item.name.includes('Rabatt') ||
              item.name.includes('Gutschrift') ||
              item.name.toLowerCase() === 'zahlungsart' ||
              item.name.toLowerCase() === 'gegeben' ||
              item.name.toLowerCase() === 'rückgeld';

            if (isDiscountOrMeta) {
              // Specific formatting for payment details
              if (
                item.name.toLowerCase() === 'zahlungsart' ||
                item.name.toLowerCase() === 'gegeben' ||
                item.name.toLowerCase() === 'rückgeld'
              ) {
                printer.setTextSize(0, 0);
                printer.leftRight(item.name + ':', item.price);
                printer.setTextNormal();
              } else {
                // Standard leftRight for discounts/credits
                printer.leftRight(item.name, item.price);
              }
            }
          } catch (detailError) {
            console.error('Error printing discount/payment item:', detailError, item);
            // Continue printing other details if one fails
          }
        });
        printer.drawLine(); // Separator after discount/payment details
      } else {
        // Only draw line after items if no discount section follows
        printer.drawLine();
      }
    }

    // --- Total ---
    if (total) {
      printer.bold(true);
      printer.setTextSize(1, 1);
      printer.leftRight('GESAMT:', total);
      printer.setTextNormal();
      printer.bold(false);
    }

    printer.newLine();

    // --- VAT Info ---
    printer.alignCenter();
    printer.setTextSize(0, 0);
    printer.println('Enthaltene MwSt. 19%'); // Assuming fixed VAT
    printer.setTextNormal();
    printer.newLine();

    // --- Company Info ---
    printer.println('BankLy LLC German Branch');
    printer.println('Mainzer Landstraße 55');
    printer.println('60325 Frankfurt, Germany');
    printer.newLine();

    // --- QR Code ---
    try {
      printer.alignCenter();
      if (orderNumber) {
        printer.printQR(`RECEIPT:${orderNumber}`, {
          cellSize: 5,
          correction: 'M',
          model: 2,
        });
        printer.newLine();
      }
    } catch (qrError) {
      console.error('Error printing QR code:', qrError);
      // Continue printing even if QR code fails
    }

    // --- Footer Text ---
    if (footerText) {
      printer.alignCenter();
      printer.println(footerText);
      printer.newLine();
    }

    printer.cut();

    // --- Execute Print Job ---
    try {
      await printer.execute();
      res.json({ success: true, message: 'Beleg erfolgreich gedruckt' });
    } catch (printError) {
      console.error('Error executing print job:', printError);
      try {
        printer.clear(); // Attempt to clear printer buffer on error
      } catch (e) {
        console.error('Error clearing printer during print error handling:', e);
      }
      res.status(500).json({
        error: printError.message || 'Fehler beim Drucken',
        success: false,
        message: 'Druckauftrag konnte nicht ausgeführt werden.',
      });
    }
  } catch (error) {
    console.error('Fehler bei der Belegerstellung:', error);

    let errorMessage = 'Ein unbekannter Fehler ist bei der Belegerstellung aufgetreten.';
    if (error.message) {
      errorMessage = error.message;
    }
    // Specific error handling can be useful
    if (error.code === 'ECONNREFUSED') {
      errorMessage =
        'Drucker nicht erreichbar. Bitte überprüfen Sie die Verbindung und den Druckerservice.';
    } else if (error.code === 'EPERM') {
      errorMessage = 'Keine Berechtigung zum Zugriff auf den Drucker.';
    }

    try {
      printer.clear(); // Attempt to clear printer buffer on general error
    } catch (clearError) {
      console.error('Error clearing printer after failure:', clearError);
    }

    res.status(500).json({
      error: errorMessage,
      message: 'Beleg konnte nicht erstellt oder gedruckt werden.',
      success: false,
    });
  }
});

/**
 * @route POST /print/deposit
 * @description Generates and prints a deposit slip (Pfandbon).
 * @param {object} req.body - The deposit slip data.
 * @param {string} [req.body.title='PFANDBON'] - The title of the deposit slip.
 * @param {Array<object>} req.body.items - Array of deposit items.
 * @param {string} req.body.items[].name - Name of the deposit item.
 * @param {string} req.body.items[].price - Value of the deposit item (formatted string).
 * @param {string} [req.body.items[].description] - Optional description.
 * @param {string} req.body.total - The total deposit amount (formatted string).
 * @param {string} req.body.date - The date of the transaction.
 * @param {string} req.body.orderNumber - The unique slip number (used for barcode).
 * @returns {object} 200 - Success response indicating the slip was printed.
 * @returns {object} 500 - Error response if printing fails.
 */
app.post('/print/deposit', async (req, res) => {
  try {
    const { title, items, total, date, orderNumber } = req.body;

    printer.clear();

    // --- Header ---
    printer.alignCenter();
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(title || 'PFANDBON');
    printer.bold(false);
    printer.setTextNormal();
    printer.newLine();

    // --- Meta Info ---
    printer.alignLeft();
    printer.setTextSize(0, 0);
    if (orderNumber) {
      printer.println(`Beleg-Nr.: ${orderNumber}`);
    }
    if (date) {
      printer.println(`Datum: ${date}`);
    }
    printer.setTextNormal();
    printer.drawLine();

    // --- Items ---
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
          console.error('Error printing deposit item:', itemError, item);
          // Continue printing other items if one fails
        }
      });
    }

    printer.drawLine();

    // --- Total ---
    if (total) {
      printer.bold(true);
      printer.setTextSize(1, 1);
      printer.leftRight('GESAMT PFAND:', total);
      printer.setTextNormal();
      printer.bold(false);
    }

    printer.newLine();

    // --- Company Info ---
    printer.alignCenter();
    printer.setTextSize(0, 0);
    printer.println('BankLy LLC German Branch');
    printer.println('Mainzer Landstraße 55');
    printer.println('60325 Frankfurt, Germany');
    printer.setTextNormal();
    printer.newLine();

    // --- Barcode (EAN-13) ---
    try {
      if (orderNumber) {
        printer.alignCenter();

        // Prepare barcode value: numeric, 12 digits (EAN-13 needs 12 data + 1 check digit)
        let barcodeValue = orderNumber.replace(/\\D/g, ''); // Remove non-digits

        // Check if the cleaned barcode has the correct length for EAN-13 (13 digits)
        if (barcodeValue.length === 13) {
          // Use the first 12 digits for the printBarcode function (it calculates the check digit)
          barcodeValue = barcodeValue.substring(0, 12);
        } else {
          // Handle cases where the input is not 13 digits - log a warning
          console.warn(
            `Provided orderNumber '${orderNumber}' is not a valid 13-digit EAN-13 format after cleaning. Attempting to print by padding/truncating to 12 digits.`
          );
          // Fallback: Pad or truncate to 12 digits as before
          if (barcodeValue.length < 12) {
            barcodeValue = barcodeValue.padStart(12, '0');
          } else if (barcodeValue.length > 12) {
            // Take the last 12 digits if too long (might still be incorrect)
            barcodeValue = barcodeValue.substring(barcodeValue.length - 12);
          }
        }

        // Print EAN-13 (Type 67). Library calculates check digit.
        printer.printBarcode(barcodeValue, 67, {
          hriPos: 2, // HRI below barcode
          hriFont: 0, // Font A
          width: 3, // Barcode width multiplier
          height: 80, // Barcode height
        });
        printer.newLine();
      }
    } catch (barcodeError) {
      console.error('Error printing EAN13 barcode:', barcodeError);
      // Continue printing even if barcode fails
    }

    printer.cut();

    // --- Execute Print Job ---
    try {
      await printer.execute();
      res.json({ success: true, message: 'Pfandbeleg erfolgreich gedruckt' });
    } catch (printError) {
      console.error('Error executing print job:', printError);
      try {
        printer.clear(); // Attempt to clear printer buffer on error
      } catch (e) {
        console.error('Error clearing printer during print error handling:', e);
      }
      res.status(500).json({
        error: printError.message || 'Fehler beim Drucken',
        success: false,
        message: 'Druckauftrag konnte nicht ausgeführt werden.',
      });
    }
  } catch (error) {
    console.error('Fehler bei der Pfandbonerstellung:', error);

    let errorMessage = 'Ein unbekannter Fehler ist bei der Pfandbonerstellung aufgetreten.';
    if (error.message) {
      errorMessage = error.message;
    }
    if (error.code === 'ECONNREFUSED') {
      errorMessage =
        'Drucker nicht erreichbar. Bitte überprüfen Sie die Verbindung und den Druckerservice.';
    } else if (error.code === 'EPERM') {
      errorMessage = 'Keine Berechtigung zum Zugriff auf den Drucker.';
    }

    try {
      printer.clear(); // Attempt to clear printer buffer on general error
    } catch (clearError) {
      console.error('Error clearing printer after failure:', clearError);
    }

    res.status(500).json({
      error: errorMessage,
      message: 'Pfandbon konnte nicht erstellt oder gedruckt werden.',
      success: false,
    });
  }
});

/**
 * @route POST /print/barcode
 * @description Prints an EAN-13 barcode based on the provided ID.
 * @param {object} req.body - The request body.
 * @param {string} req.body.id - The EAN number (12 or 13 digits) to print as a barcode.
 * @returns {object} 200 - Success response indicating the barcode was printed.
 * @returns {object} 400 - Bad request if the ID is invalid.
 * @returns {object} 500 - Error response if printing fails.
 */
app.post('/print/barcode', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing "id" in request body.',
      });
    }

    // Prepare barcode value: numeric, 12 or 13 digits
    let barcodeValue = id.replace(/\D/g, ''); // Remove non-digits

    // Validate for EAN-13 (needs 12 data digits for the library)
    if (barcodeValue.length === 13) {
      // Library calculates check digit, so provide the first 12
      barcodeValue = barcodeValue.substring(0, 12);
    } else if (barcodeValue.length !== 12) {
      console.warn(
        `Provided ID '${id}' is not a valid 12 or 13-digit EAN format after cleaning. Cannot print barcode.`
      );
      return res.status(400).json({
        success: false,
        message: `Provided ID '${id}' is not a valid 12 or 13-digit EAN format.`,
      });
    }

    printer.clear();
    printer.alignCenter();

    // --- Print Barcode (EAN-13) ---
    try {
      // Print EAN-13 (Type 67). Library calculates check digit.
      printer.printBarcode(barcodeValue, 67, {
        hriPos: 2, // HRI below barcode
        hriFont: 0, // Font A
        width: 3, // Barcode width multiplier
        height: 80, // Barcode height
      });
      printer.newLine(); // Add some space after the barcode
    } catch (barcodeError) {
      console.error('Error printing EAN13 barcode:', barcodeError);
      // Attempt to clear printer buffer on barcode specific error
      try {
        printer.clear();
      } catch (e) {
        console.error('Error clearing printer during barcode error handling:', e);
      }
      return res.status(500).json({
        error: barcodeError.message || 'Error generating barcode',
        success: false,
        message: 'Barcode could not be generated or printed.',
      });
    }

    printer.cut();

    // --- Execute Print Job ---
    try {
      await printer.execute();
      res.json({ success: true, message: 'Barcode erfolgreich gedruckt' });
    } catch (printError) {
      console.error('Error executing print job:', printError);
      try {
        printer.clear(); // Attempt to clear printer buffer on error
      } catch (e) {
        console.error('Error clearing printer during print error handling:', e);
      }
      res.status(500).json({
        error: printError.message || 'Fehler beim Drucken',
        success: false,
        message: 'Druckauftrag konnte nicht ausgeführt werden.',
      });
    }
  } catch (error) {
    console.error('Fehler bei der Barcode-Druckanforderung:', error);
    try {
      printer.clear(); // Attempt to clear printer buffer on general error
    } catch (clearError) {
      console.error('Error clearing printer after general failure:', clearError);
    }
    res.status(500).json({
      error: error.message || 'Unbekannter Fehler',
      message: 'Barcode konnte nicht gedruckt werden.',
      success: false,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Printer Service running on port ${PORT}`);
});
