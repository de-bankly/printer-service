# Thermal Printer Service

A Node.js service to handle receipt printing for point-of-sale systems, built with Express.

## Features

- Receipt printing with customizable content
- Deposit slip printing with barcode support
- Support for Epson thermal printers
- QR code generation for digital receipts
- Comprehensive error handling

## Prerequisites

- Node.js (v14.x or higher)
- Properly configured thermal printer accessible via network or USB
- Printer must be shared and accessible at the configured path

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/thermal-printer-service.git
cd thermal-printer-service

# Install dependencies
npm install
```

## Configuration

The printer configuration is located in `printer-service/index.js`. Modify the settings to match your printer:

```javascript
const printer = new ThermalPrinter({
  type: PrinterTypes.EPSON,
  interface: '\\\\localhost\\Printer69',
  characterSet: 'PC858_EURO',
  removeSpecialCharacters: false,
  lineCharacter: '-',
});
```

## Usage

### Starting the Server

```bash
npm start
```

The server will start on port 3001 by default.

### API Endpoints

#### Check Service Status

```
GET /
```

Returns the status of the printer service.

#### Print Receipt

```
POST /print/receipt
```

Request body:

```json
{
  "title": "KAUFBELEG",
  "orderNumber": "12345",
  "date": "2023-09-01 14:30",
  "items": [
    {
      "name": "Product Name",
      "price": "€10.00",
      "description": "Optional product description"
    }
  ],
  "total": "€10.00"
}
```

#### Print Deposit Slip

```
POST /print/deposit
```

Request body:

```json
{
  "title": "PFANDBON",
  "orderNumber": "12345",
  "date": "2023-09-01 14:30",
  "items": [
    {
      "name": "Deposit Item",
      "price": "€0.25"
    }
  ],
  "total": "€0.25"
}
```

## Error Handling

The service includes error handling for common printer issues:

- Connection problems
- Permission errors
- Print job execution failures

## Development

### Dependencies

- Express - Web server framework
- node-thermal-printer - Thermal printer library
- cors - Cross-origin resource sharing middleware

## License

MIT
