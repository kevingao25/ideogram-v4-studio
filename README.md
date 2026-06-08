# Ideogram V4 Studio

A unified visual explorer for Ideogram 4.0 structured prompts and the four V4 API workflows:

- Generate from plain text or structured JSON
- Drag and resize normalized bounding boxes
- Expand text with Magic Prompt
- Describe an image into reusable V4 JSON
- Remix an image with adjustable source influence
- Inspect every request and response

Visitors bring their own Ideogram API key. The key is kept in `sessionStorage`, forwarded through a stateless Next.js route, and never configured as a server environment variable.

## Security model

- API keys are stored only for the current browser session.
- The application does not contain or require a shared Ideogram API key.
- Relay routes do not log request headers, payloads, or credentials.
- Local history stores prompt recipes and generation metadata only.
- Generated image files and temporary Ideogram URLs are not persisted.

The deployment platform can still observe ordinary infrastructure metadata. Review your host's logging and privacy controls before using sensitive prompts or images.

## Local development

Requirements:

- Node.js 20.9 or newer
- An [Ideogram API key](https://ideogram.ai/manage-api)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter your key, and select **Save key**.

No `.env` file is needed.

## Production build

```bash
npm run build
```

## Deploy to Vercel

1. Fork or clone this repository.
2. Import it as a new project in [Vercel](https://vercel.com/new).
3. Keep the detected framework as **Next.js**.
4. Do not add an Ideogram API key environment variable.
5. Deploy.

Vercel will build the UI and host the four stateless relay routes:

| Local route | Ideogram endpoint |
| --- | --- |
| `POST /api/ideogram/generate` | `POST /v1/ideogram-v4/generate` |
| `POST /api/ideogram/remix` | `POST /v1/ideogram-v4/remix` |
| `POST /api/ideogram/magic-prompt` | `POST /v1/ideogram-v4/magic-prompt` |
| `POST /api/ideogram/describe` | `POST /v1/ideogram-v4/describe` |

## Bounding-box format

Ideogram V4 uses normalized coordinates in this order:

```text
[y_min, x_min, y_max, x_max]
```

Each value ranges from `0` to `1000`, measured from the top-left corner. The canvas keeps these values synchronized with the raw structured JSON editor.

## Official documentation

- [Generate with Ideogram 4.0](https://developer.ideogram.ai/api-reference/api-reference/generate-v4)
- [Remix with Ideogram 4.0](https://developer.ideogram.ai/api-reference/api-reference/remix-v4)
- [Generate a Magic Prompt with Ideogram 4.0](https://developer.ideogram.ai/api-reference/api-reference/magic-prompt-v4)
- [Describe with Ideogram 4.0](https://developer.ideogram.ai/api-reference/api-reference/describe-v4)
- [API setup](https://developer.ideogram.ai/ideogram-api/api-setup)

## License

MIT
