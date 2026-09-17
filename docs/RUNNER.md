# Register a self-hosted runner for wildananugrah/task

The carreel and diudara runners are **repo-scoped**, so neither will pick up a
job from this repository. This box needs a third one.

Get a registration token first:
  https://github.com/wildananugrah/task/settings/actions/runners/new
(the `--token` value is short-lived; copy it just before running config.sh)

```sh
cd ~
mkdir actions-runner-task && cd actions-runner-task
curl -o actions-runner-linux-x64-2.337.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.337.0/actions-runner-linux-x64-2.337.0.tar.gz
tar xzf actions-runner-linux-x64-2.337.0.tar.gz

./config.sh --url https://github.com/wildananugrah/task \
            --token <PASTE_TOKEN> \
            --name wildandev --labels self-hosted --unattended

sudo ./svc.sh install wildandev
sudo ./svc.sh start
sudo ./svc.sh status
```

Run config.sh as `wildandev`, not root: the runner captures its PATH at that
moment, and it needs the one that finds bun and pm2 in ~/.bun/bin. The service
then runs as that user, which is what makes `sudo -n` inside deploy.sh work.
