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
  res.send('Printer Service is running');
});

// Check printer status
app.get('/status', async (req, res) => {
  try {
    printer.alignCenter();
    printer.println('Lukas Stinkt!!!!!');
    printer.drawLine();
    printer.cut();

    await printer
      .execute()
      .then(success => {
        console.log(success);
        res.json({
          success: true,
        });
      })
      .catch(err => {
        res.json({
          success: false,
          error: err,
        });
      });

    printer.clear();
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    // Header
    printer.alignCenter();
    printer.bold(true);
    printer.println(title || 'RECEIPT');
    printer.bold(false);
    printer.newLine();

    // Order info
    printer.alignLeft();
    if (orderNumber) {
      printer.println(`Order: ${orderNumber}`);
    }
    if (date) {
      printer.println(`Date: ${date}`);
    }
    printer.drawLine();

    // Items
    if (items && Array.isArray(items)) {
      items.forEach(item => {
        printer.leftRight(item.name, item.price);
        if (item.description) {
          printer.println(`  ${item.description}`);
        }
      });
    }

    printer.drawLine();

    // Total
    if (total) {
      printer.bold(true);
      printer.leftRight('TOTAL:', total);
      printer.bold(false);
    }

    // Footer
    if (footerText) {
      printer.newLine();
      printer.alignCenter();
      printer.println(footerText);
    }

    printer.cut();

    const success = await printer.execute();

    printer.clear();

    res.json({ success, message: 'Receipt printed successfully' });
  } catch (error) {
    console.error('Receipt printing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Printer Service running on port ${PORT}`);
});
