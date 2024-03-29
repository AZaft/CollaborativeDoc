var Quill = require('quill');
var QuillCursors = require('quill-cursors');
var Delta = require('quill-delta');
Quill.register('modules/cursors', QuillCursors);
var tinycolor = require('tinycolor2');


let id;
let docID = window.location.pathname.substring(window.location.pathname.lastIndexOf('/') + 1);
let documentID = false;
let version;
let colors = [];
let ack = true;
let ops_queue = [];

var toolbarOptions = [
  ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
  ['blockquote', 'code-block'],

  [{ 'list': 'ordered'}, { 'list': 'bullet' }],
  [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
  [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
  [{ 'direction': 'rtl' }],                         // text direction

  [ 'link', 'image', 'formula' ],                   // Image
  [{ 'header': [1, 2, 3, 4, 5, 6, false] }],        // custom dropdown

  [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
  [{ 'font': [] }],
  [{ 'align': [] }],

  ['clean']                                         // remove formatting button
];


var quill = new Quill('#editor', {
    modules: {
        toolbar: toolbarOptions,
        cursors: true
    },

    theme: 'snow'
});
var cursors = quill.getModule('cursors');

document.addEventListener("DOMContentLoaded", () => {
  let toolbar = document.getElementsByClassName("ql-toolbar");
  let button = document.createElement("button");
  button.innerHTML = "<i class=\"fa fa-home\"> Home </i>";
  button.onclick = function() {location.href='/';};
  toolbar[0].append(button);
  connectDoc();
});

quill.on('text-change', function (delta, oldDelta, source) {
    if (source !== 'user') return;

    //array of ops for future buffering
    ops_queue.push(delta);
    let numOps = ops_queue.length;

    if(ack){
      sendOp(ops_queue[0].ops);
    }
});

function sendOp(ops){
  ack = false;
  var xhr = new XMLHttpRequest();
  xhr.open("POST", ("/doc/op/" + docID + "/" + id), true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function(){
    let response = JSON.parse(this.responseText);
    if(response.status === "retry"){
      console.log("Retrying, client: " + version + ", server: " + response.version);
      sendOp(ops, version); 
    } else if(response.error) {
      window.location.href = '/';
    }
  };

  xhr.send(JSON.stringify({
    version: version,
    op: ops
  }));
}

quill.on('selection-change', function(range, oldRange, source) {
  if (source !== 'user') return;
  
  if (!range) return;
  
  console.log(range);
  var xhr = new XMLHttpRequest();
  xhr.open("POST", ("/doc/presence/" + docID + "/" + id), true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.send(JSON.stringify(range));
});


var toolbar = quill.getModule('toolbar');
toolbar.addHandler('image', imageHandler);

function imageHandler() {
  var value = prompt('please copy paste the image url here.');
  if(value){
    var range = this.quill.getSelection();
    this.quill.insertEmbed(range.index, 'image', value, Quill.sources.USER);
  }
}

function connectDoc(){
  if(!docID){
    return;
  }

  const uID = Date.now();
  const evtSource = new EventSource("/doc/connect/" + docID + "/" + uID);
  id = uID;

  evtSource.onmessage = function(event) {
    let data = JSON.parse(event.data);
    console.log(data);

    if(data.ack){
      ack = true;
      version++;
      ops_queue.shift();

      if(ops_queue.length > 0) {
        sendOp(ops_queue[0].ops);
      }
    } else if(data.error){
      console.log(data.error);
      window.location.href = '/';
    } else if(data.presence){
      if(data.presence.cursor){
        console.log(data.presence);
        let id = data.presence.id;
        let index = data.presence.cursor.index;
        let length = data.presence.cursor.length;
        let name = data.presence.cursor.name;
        let range = {index, length};

        colors[id] = colors[id] || tinycolor.random().toHexString();
        console.log(id + name + colors[id]);
        cursors.createCursor(id, name, colors[id]);
        cursors.moveCursor(id, range);
      }
    } else if(data.loggedOut){
      evtSource.close();
      window.location.href = '/';
    } else {
      if(data.content) {
        version = data.version;
        quill.setContents(data.content);
      } else {
        let serverData = new Delta(data);
        version++;
        applyTransformations(serverData);

        quill.updateContents(serverData);
      }
    }
  }
}

function applyTransformations(serverData) {
  for(let i = 0; i < ops_queue.length;i++){
    ops_queue[i].transform(serverData, false);
  }

  for(let i = 0; i < ops_queue.length;i++){
    serverData.transform(ops_queue[i], true);
  }
}