# @tigris/cli

Command line interface for Tigris object storage.

## Installation

```bash
npm install -g @tigris/cli
```

## Usage

```bash
# Upload a file
tigris put my-file.txt ./local-file.txt

# Download a file
tigris get my-file.txt -o ./downloaded-file.txt

# List files
tigris list

# Remove a file
tigris remove my-file.txt
```

## Configuration

Configure your Tigris credentials via environment variables:

```bash
TIGRIS_STORAGE_BUCKET=your-bucket
TIGRIS_STORAGE_ACCESS_KEY_ID=your-access-key
TIGRIS_STORAGE_SECRET_ACCESS_KEY=your-secret-key
TIGRIS_STORAGE_ENDPOINT=your-endpoint
```

## License

MIT