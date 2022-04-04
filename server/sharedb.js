const ShareDB = require('sharedb');
const richText = require('rich-text');
const WebSocket = require('ws');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');

ShareDB.types.register(require('rich-text').type);

let shareDbServer = new ShareDB();

let connection = shareDbServer.connect();

let doc = connection.get('docs', 'InitialDoc');

doc.fetch(function (err) {
  if (err) throw err;
  if (doc.type === null) {
    doc.create([], 'rich-text', startWebSocketServer);
    return;
  }
  startWebSocketServer();
});

function startWebSocketServer(){
    let wss = new WebSocket.Server({ port: 8080 });

    wss.on('connection', function connection(ws) {
        let jsonStream = new WebSocketJSONStream(ws);
        shareDbServer.listen(jsonStream);
        console.log('Listening on http://localhost:8080');
    });
}

