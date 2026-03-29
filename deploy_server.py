"""Quick deploy script — sets up the Vultr server for Pantheon voice call Mini App.

Usage:
    uv run python deploy_server.py
"""

from __future__ import annotations

import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()


def ssh_exec(client: object, cmd: str, *, timeout: int = 60) -> str:
    """Execute a command via SSH and return combined output."""
    import paramiko

    assert isinstance(client, paramiko.SSHClient)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    return out + err


def main() -> None:
    import paramiko

    host = os.getenv("VULTR_SERVER_IP", "155.138.218.106")
    user = "root"
    password = os.getenv("VULTR_SERVER_PASS", "")
    if not password:
        print("Set VULTR_SERVER_PASS in .env")
        sys.exit(1)

    print(f"Connecting to {host}...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=15)

    domain = f"{host.replace('.', '-')}.sslip.io"
    print(f"Using domain: {domain}")

    # --- Install Caddy (reverse proxy with auto-HTTPS via Let's Encrypt) ---
    print("Installing Caddy...")
    ssh_exec(client, """
        if ! command -v caddy &>/dev/null; then
            apt-get update -qq
            apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
            curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
            curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
            apt-get update -qq
            apt-get install -y -qq caddy
        fi
        caddy version
    """, timeout=120)
    print("Caddy installed.")

    # --- Install uv ---
    print("Installing uv...")
    ssh_exec(client, """
        if ! command -v uv &>/dev/null; then
            curl -LsSf https://astral.sh/uv/install.sh | sh
        fi
        export PATH="$HOME/.local/bin:$PATH"
        uv --version
    """, timeout=60)

    # --- Sync project code ---
    print("Syncing project files...")
    # Use SFTP to push key files
    sftp = client.open_sftp()

    # Ensure directories exist
    ssh_exec(client, "mkdir -p /root/pantheon/gateway/static")

    # Push the webapp and static files
    local_base = os.path.dirname(os.path.abspath(__file__))
    files_to_push = [
        "gateway/webapp.py",
        "gateway/static/call.html",
        "gateway/__init__.py",
        "gateway/runner.py",
        "gateway/session.py",
        "gateway/bot.py",
        "voice/__init__.py",
        "voice/client.py",
        "voice/agent.py",
        "voice/personas.py",
        "voice/exceptions.py",
        "pyproject.toml",
        "run.py",
    ]

    for rel_path in files_to_push:
        local_path = os.path.join(local_base, rel_path)
        if os.path.exists(local_path):
            remote_dir = f"/root/pantheon/{os.path.dirname(rel_path)}"
            ssh_exec(client, f"mkdir -p {remote_dir}")
            sftp.put(local_path, f"/root/pantheon/{rel_path}")
            print(f"  Pushed {rel_path}")

    # Push .env with updated WEBAPP_BASE_URL
    env_content = f"""# Pantheon — server environment
ELEVENLABS_API_KEY={os.getenv('ELEVENLABS_API_KEY', '')}
ELEVENLABS_AGENT_ID={os.getenv('ELEVENLABS_AGENT_ID', '')}
ELEVENLABS_VOICE_ID={os.getenv('ELEVENLABS_VOICE_ID', '')}
TELEGRAM_BOT_TOKEN={os.getenv('TELEGRAM_BOT_TOKEN', '')}
WEBAPP_BASE_URL=https://{domain}
WEBAPP_PORT=8443
SANDBOX_URL=http://localhost:9090
LOG_LEVEL=INFO
SAMPLES_DIR=/tmp/samples
"""
    with sftp.open("/root/pantheon/.env", "w") as f:
        f.write(env_content)
    print("  Pushed .env")

    # Also push agents/ files needed by voice/client.py and other imports
    for agent_file in ["agents/__init__.py", "agents/_dev_stub.py", "agents/prompts.py", "agents/model_config.py"]:
        local_path = os.path.join(local_base, agent_file)
        if os.path.exists(local_path):
            ssh_exec(client, "mkdir -p /root/pantheon/agents")
            sftp.put(local_path, f"/root/pantheon/{agent_file}")
            print(f"  Pushed {agent_file}")

    # Push sandbox models
    for sandbox_file in ["sandbox/__init__.py", "sandbox/models.py"]:
        local_path = os.path.join(local_base, sandbox_file)
        if os.path.exists(local_path):
            ssh_exec(client, "mkdir -p /root/pantheon/sandbox")
            sftp.put(local_path, f"/root/pantheon/{sandbox_file}")
            print(f"  Pushed {sandbox_file}")

    sftp.close()

    # --- Install Python dependencies ---
    print("Installing dependencies...")
    result = ssh_exec(client, """
        cd /root/pantheon
        export PATH="$HOME/.local/bin:$PATH"
        uv sync 2>&1 | tail -5
    """, timeout=120)
    print(result)

    # --- Configure Caddy for HTTPS ---
    print(f"Configuring Caddy for {domain}...")
    caddyfile = f"""
{domain} {{
    reverse_proxy localhost:8443
}}
"""
    ssh_exec(client, f"""
        cat > /etc/caddy/Caddyfile << 'CADDYEOF'
{caddyfile}
CADDYEOF
        systemctl restart caddy
        systemctl enable caddy
    """)
    print("Caddy configured and restarted.")

    # --- Open firewall ports ---
    print("Opening firewall ports...")
    ssh_exec(client, """
        ufw allow 80/tcp 2>/dev/null
        ufw allow 443/tcp 2>/dev/null
        ufw allow 8443/tcp 2>/dev/null
    """)

    # --- Create systemd service for the webapp ---
    print("Setting up systemd service...")
    ssh_exec(client, """
        cat > /etc/systemd/system/pantheon-webapp.service << 'EOF'
[Unit]
Description=Pantheon Voice Call WebApp
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/pantheon
EnvironmentFile=/root/pantheon/.env
Environment=PATH=/root/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/root/.local/bin/uv run python -c "import uvicorn; from gateway.webapp import app; uvicorn.run(app, host='127.0.0.1', port=8443)"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
        systemctl restart pantheon-webapp
        systemctl enable pantheon-webapp
    """)
    print("WebApp service started.")

    # --- Verify ---
    time.sleep(3)
    result = ssh_exec(client, """
        systemctl is-active pantheon-webapp
        curl -s http://localhost:8443/api/agent-config 2>/dev/null || echo 'webapp not responding yet'
        systemctl is-active caddy
    """)
    print(f"Status:\n{result}")

    client.close()

    print(f"\n{'='*60}")
    print(f"Deployment complete!")
    print(f"Mini App URL: https://{domain}/call")
    print(f"Agent config: https://{domain}/api/agent-config")
    print(f"Tool webhooks:")
    print(f"  Analyze: https://{domain}/api/tools/analyze")
    print(f"  Report:  https://{domain}/api/tools/report")
    print(f"  Status:  https://{domain}/api/tools/status")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
