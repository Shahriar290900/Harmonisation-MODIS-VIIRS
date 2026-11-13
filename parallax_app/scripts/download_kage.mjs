import fs from 'fs';
import path from 'path';
import https from 'https';

const outDir = path.resolve('apps/web');
const data = fs.readFileSync('kage-landing-page.json', 'utf8');

const fetchBinary = (url, dest) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBinary(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode === 200) {
        const stream = fs.createWriteStream(dest);
        res.pipe(stream);
        stream.on('finish', () => { stream.close(); resolve(); });
      } else {
        reject(new Error(`Failed to fetch ${url} - Status ${res.statusCode}`));
      }
    }).on('error', reject);
  });
};

const json = JSON.parse(data);

async function run() {
  if (json.files) {
    for (const file of json.files) {
      const filePath = path.join(outDir, file.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      
      if (file.content !== undefined) {
        fs.writeFileSync(filePath, file.content, 'utf8');
        console.log('Wrote text file:', filePath);
      }
    }
  }

  if (json.assets) {
    for (const file of json.assets) {
      const filePath = path.join(outDir, file.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      
      const relativePath = file.path.replace(/^public\//, '');
      const url = `https://threeui.com/${relativePath}`;
      console.log('Downloading binary:', filePath, 'from', url);
      try {
        await fetchBinary(url, filePath);
        console.log('Downloaded binary:', filePath);
      } catch (e) {
        console.error('Error downloading', url, e.message);
      }
    }
  }
}

run().catch(console.error);
