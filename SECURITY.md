# Security

Please do not open a public issue for a security problem.

Report it privately through **Security → Report a vulnerability** on the GitHub repository, with the steps to reproduce and the Follet version (Settings → About). You will get an answer as soon as possible, and a fix in a new release.

Things worth reporting: anything that could expose API keys (stored encrypted with Windows DPAPI in `%APPDATA%\Follet\secrets.json`), run code from outside Follet, or send personal data somewhere unexpected.