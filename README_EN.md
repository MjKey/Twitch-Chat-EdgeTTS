# Twitch Chat TTS

An application for text-to-speech conversion of Twitch chat messages using Microsoft Edge TTS.

## Features

- Twitch API authentication
- Connection to a selected Twitch channel
- Text-to-speech for messages with a specific prefix (e.g., ">>")
- Multiple voice options (Svetlana, Dmitry, or random)
- Volume control
- Moderator-only message filtering
- Message history display

## Technologies

- Electron
- React
- TypeScript
- Twitch API
- Microsoft Edge TTS

## Installation and Setup

### For Developers

#### Prerequisites

- Node.js 14+ and npm
- Registered Twitch application for API keys

#### Installation

1. Clone the repository:
   ```
   git clone https://github.com/MjKey/Twitch-Chat-TTS.git
   cd twitch-chat-tts
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `config.json` file in the root directory with the following content:
   ```json
   {
     "TWITCH_CLIENT_ID": "your_twitch_client_id",
     "TWITCH_CLIENT_SECRET": "your_twitch_client_secret"
   }
   ```

4. Run the application in development mode:
   ```
   npm run dev
   ```

5. To build the application:
   ```
   npm run build
   ```

### For Regular Users (Running the Built Application)

1. Download the latest version of the application from the [Releases](https://github.com/MjKey/Twitch-Chat-TTS/releases) section.

2. Extract the archive to any convenient folder.

3. **Important! You need to create a configuration file:**
   - In the folder with the program (where the `Twitch Chat TTS.exe` file is located), create a text file named `config.json`
   - To do this:
     1. Right-click in the folder → select "Create" → "Text Document"
     2. Name the file `config.json` (important: make sure the file has the `.json` extension, not `.txt`)
     3. Open the created file in any text editor (Notepad, Notepad++, etc.)
     4. Paste the following text into the file, replacing the values with your own:
     ```json
     {
       "TWITCH_CLIENT_ID": "your_twitch_client_id",
       "TWITCH_CLIENT_SECRET": "your_twitch_client_secret"
     }
     ```
     5. Save the file

4. To obtain `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`:
   - Register on the [Twitch Developer Console](https://dev.twitch.tv/console)
   - Create a new application by clicking "Register Your Application"
   - Fill out the form:
     - Name: any name (e.g., "My TTS App")
     - OAuth Redirect URLs: `http://localhost:3777`
     - Category: select "Chat Bot" or "Other"
   - Click "Create"
   - Now you will see the `Client ID` in the application information
   - Click "New Secret" to generate a `Client Secret`
   - Copy both values into your `config.json` file

5. Launch the application by double-clicking on the `Twitch Chat TTS.exe` file.

6. On first launch, allow the application to access your Twitch account by following the on-screen instructions.

## Usage

1. When you first launch the application, you need to authorize through Twitch.
2. After authorization, enter the name of the channel you want to connect to.
3. Configure the TTS prefix (e.g., ">>").
4. Select a voice for speech synthesis and set the volume.
5. Connect to the chat by clicking the "Connect" button.
6. Now messages that start with the specified prefix will be voiced.

## Advanced Settings

- **TTS Prefix**: Determines which messages will be voiced (e.g., ">>hello" will be voiced as "hello").
- **Voices**: Female (Svetlana) and male (Dmitry) voices are available, as well as a random selection option.
- **Volume**: Volume level adjustment from 0 to 100%.
- **Moderator-only messages**: When this option is enabled, only messages from channel moderators will be voiced.

## Troubleshooting

- **Application does not start**: Make sure the `config.json` file is created correctly and is in the same folder as `Twitch Chat TTS.exe`.
- **Authentication error**: Check that the `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` values in the `config.json` file are correct.
- **No sound is played**: Make sure your computer's sound is turned on and the volume is set in the application.

## Support the Developer

If you like the application, you can support the developer:
- [Boosty](https://boosty.to/mjkey)

## License

[MIT](LICENSE) 
