const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const configPath = path.join(__dirname, 'vite_electron', 'config.json');

if (!fs.existsSync(envPath)) {
    console.error('.env файл не найден!');
    process.exit(1);
}

const env = fs.readFileSync(envPath, 'utf8');
const config = {};

env.split('\n').forEach(line => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
        const key = match[1];
        let value = match[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if ([
                'TWITCH_CLIENT_ID',
                'TWITCH_CLIENT_SECRET'
            ].includes(key)) {
            config[key] = value;
        }
    }
});

fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
console.log('config.json успешно создан:', configPath);