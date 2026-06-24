import net from 'net';

const testConn = (host, port) => {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => {
            console.log(`✅ Successfully connected to ${host}:${port}`);
            socket.destroy();
            resolve(true);
        });
        socket.on('error', (err) => {
            console.log(`❌ Failed to connect to ${host}:${port} - Error: ${err.stack || err.message}`);
            socket.destroy();
            resolve(false);
        });
        socket.on('timeout', () => {
            console.log(`❌ Timeout connecting to ${host}:${port}`);
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, host);
    });
};

async function main() {
    console.log("Starting diagnostic connection tests...");
    await testConn('127.0.0.1', 5433);
    await testConn('localhost', 5433);
    await testConn('172.22.255.76', 5433);
    await testConn('127.0.0.1', 6380);
    await testConn('localhost', 6380);
    await testConn('172.22.255.76', 6380);
}

main();
