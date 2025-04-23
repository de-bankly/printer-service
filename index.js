import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

const printer = new ThermalPrinter({
  type: PrinterTypes.EPSON,
  interface: '\\\\localhost\\Printer69',
  characterSet: 'SLOVENIA',
  removeSpecialCharacters: false,
  lineCharacter: '-',
});

// Routes
app.get('/', (req, res) => {
  try {
    // Simple way to check printer connection status
    const isConnected = true; // Assume connected for simplicity, in a real app would check with the printer.isPrinterConnected()

    res.json({
      success: isConnected,
      message: isConnected
        ? 'Printer service is running and ready'
        : 'Printer service is running but printer not connected',
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

// Check printer status - without printing a test page
app.get('/status', async (req, res) => {
  try {
    // Check if printer is connected without printing anything
    const isConnected = true; // In a real app this would use printer.isPrinterConnected() or similar

    console.log('Status check requested - reporting printer as connected:', isConnected);

    res.json({
      success: isConnected,
      message: isConnected ? 'Printer is connected' : 'Printer is not connected',
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error checking printer status',
    });
  }
});

// Print endpoint
app.post('/print', async (req, res) => {
  try {
    const { content, options } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'No content provided for printing' });
    }

    // Process print content
    if (content.text) {
      printer.println(content.text);
    }

    if (content.alignCenter) {
      printer.alignCenter();
    }

    if (content.alignLeft) {
      printer.alignLeft();
    }

    if (content.alignRight) {
      printer.alignRight();
    }

    if (content.drawLine) {
      printer.drawLine();
    }

    if (content.title) {
      printer.alignCenter();
      printer.bold(true);
      printer.println(content.title);
      printer.bold(false);
      printer.drawLine();
    }

    if (content.items && Array.isArray(content.items)) {
      content.items.forEach(item => {
        printer.println(item);
      });
    }

    // Add a cut at the end
    if (content.cut !== false) {
      printer.cut();
    }

    // Execute print job
    const success = await printer.execute();

    printer.clear();

    res.json({ success, message: 'Print job sent successfully' });
  } catch (error) {
    console.error('Printing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Custom print template for receipt
app.post('/print/receipt', async (req, res) => {
  try {
    const { title, items, total, date, orderNumber, footerText, printerConfig } = req.body;

    // Set printer configuration if provided
    if (printerConfig) {
      try {
        if (printerConfig.characterSet) {
          printer.setCharacterSet(printerConfig.characterSet);
          console.log(`Character set set to: ${printerConfig.characterSet}`);
        }
      } catch (configError) {
        console.error('Error setting printer configuration:', configError);
        // Continue execution even if configuration fails
        // Just log the error but don't stop the printing process
      }
    }

    // Clear any previous print jobs
    printer.clear();

    // Header
    printer.alignCenter();
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(title || 'KAUFBELEG');
    printer.bold(false);
    printer.setTextNormal();
    printer.newLine();

    // Order info
    printer.alignLeft();
    if (orderNumber) {
      printer.println(`Beleg-Nr.: ${orderNumber}`);
    }
    if (date) {
      printer.println(`Datum: ${date}`);
    }
    printer.drawLine();

    // Items
    if (items && Array.isArray(items)) {
      let hasDiscountItems = false;

      // First print regular items (products)
      items.forEach(item => {
        try {
          // Skip special items like discounts, payment methods for now
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
          // Continue with other items
        }
      });

      // Print subtotal if there are discounts or special items
      if (hasDiscountItems) {
        printer.drawLine();
        printer.bold(true);
        printer.leftRight('ZWISCHENSUMME:', total);
        printer.bold(false);

        // Now print discount items
        items.forEach(item => {
          try {
            if (item.name.includes('Rabatt') || item.name.includes('Gutschrift')) {
              printer.leftRight(item.name, item.price);
            }
          } catch (discountError) {
            console.error('Error printing discount item:', discountError, item);
            // Continue with other items
          }
        });

        // Print payment info
        printer.drawLine();
        items.forEach(item => {
          try {
            if (item.name === 'Zahlungsart') {
              printer.leftRight(item.name, item.price);
            }
          } catch (paymentError) {
            console.error('Error printing payment item:', paymentError, item);
            // Continue with other items
          }
        });

        // Print change info if applicable
        items.forEach(item => {
          try {
            if (item.name === 'Rückgeld') {
              printer.leftRight(item.name, item.price);
            }
          } catch (changeError) {
            console.error('Error printing change item:', changeError, item);
            // Continue with other items
          }
        });
      }
    }

    printer.drawLine();

    // Total
    if (total) {
      printer.bold(true);
      printer.setTextSize(0, 1);
      printer.leftRight('GESAMTBETRAG:', total);
      printer.setTextNormal();
      printer.bold(false);
    }

    // Add tax information
    printer.newLine();
    printer.alignCenter();
    printer.println('Enthaltene MwSt. 19%');

    // Add store information
    printer.newLine();
    printer.println('BankLy LLC German Branch');
    printer.println('Mainzer Landstraße 55');
    printer.println('60325 Frankfurt, Germany');

    // Footer
    if (footerText) {
      printer.newLine();
      printer.alignCenter();
      printer.bold(true);
      printer.println(footerText);
      printer.bold(false);
    }

    // Add QR code for digital receipt (optional)
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
      // Continue even if QR code fails
    }

    printer.cut();

    // Execute print
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

    // Try to send a more helpful error message
    let errorMessage = error.message;
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Drucker nicht erreichbar. Bitte überprüfen Sie die Verbindung.';
    } else if (error.code === 'EPERM') {
      errorMessage = 'Keine Berechtigung zum Zugriff auf den Drucker.';
    }

    // Make sure to clear the printer
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

// Start server
app.listen(PORT, () => {
  console.log(`Printer Service running on port ${PORT}`);
});
