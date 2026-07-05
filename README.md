# Login Server

A self-hosted login page. Run it on your PC, and other devices on the
same network can log in through their browser with a username and password.

## 1. Requirements
Install [Node.js](https://nodejs.org) (v18 or newer) on your PC.

## 2. Setup
Unzip this project, open a terminal in the folder, and run:

```
npm install
```

## 3. Set your own username/password
1. Generate a password hash:
   ```
   node hash-password.js "yourNewPassword"
   ```
2. Copy the printed hash into `server.js`, replacing the value of
   `USERS.admin.passwordHash`.
3. Change `admin` to a different username if you like (edit the `USERS` object).
4. Also change the `secret` value in the `session(...)` config in
   `server.js` to any random string.

## 4. Run the server
```
npm start
```

You'll see something like:
```
Login server running!
  On this PC:        http://localhost:3000
  From other devices: http://192.168.1.42:3000
```

## 5. Log in from another device
- Make sure the other device (phone, laptop, etc.) is on the **same
  Wi-Fi/network** as your PC.
- Open a browser and go to the "From other devices" address shown above
  (e.g. `http://192.168.1.42:3000`).
- Enter the username/password you set up and click Log In.

## Notes & security
- This setup is for **local network** use (same Wi-Fi/router). Anyone on
  your network can reach this address, so use a strong password.
- Your PC's local IP can change if you reconnect to Wi-Fi. If the address
  stops working, just re-run `npm start` and check the new IP printed in
  the terminal, or set a static IP/DHCP reservation on your router.
- If it doesn't connect from another device, check your PC's firewall —
  you may need to allow Node.js / port 3000 through it.
- To make this reachable from **outside your home network** (the internet),
  you'd need port forwarding on your router and, importantly, HTTPS (e.g.
  via a reverse proxy like Caddy or Nginx with Let's Encrypt) — sending
  a plain password over the open internet without HTTPS is unsafe. Ask me
  if you want help setting that up.
- Sessions last 8 hours by default (`cookie.maxAge` in `server.js`).
