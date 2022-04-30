const ShareDB = require('sharedb');
const richText = require('rich-text');
const WebSocket = require('ws');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');

ShareDB.types.register(require('rich-text').type);

const db = require('sharedb-mongo')('mongodb://localhost:27017/CollaborativeDoc', {mongoOptions: {}});

let shareDbServer = new ShareDB({db});

let connection = shareDbServer.connect();


startWebSocketServer();

function startWebSocketServer(){
    let wss = new WebSocket.Server({ port: 8080 });

    wss.on('connection', function connection(ws) {
        let jsonStream = new WebSocketJSONStream(ws);
        shareDbServer.listen(jsonStream);
        console.log('Listening on http://localhost:8080');
    });
}