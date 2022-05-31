var Quill = require('quill');
var QuillCursors = require('quill-cursors');
Quill.register('modules/cursors', QuillCursors);
var tinycolor = require('tinycolor2');


let id;
let docID = window.location.href.substring(window.location.href.lastIndexOf('/') + 1);
let documentID = false;
let version;
let colors = [];
let ack = false;

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

connectDoc();

quill.on('text-change', function (delta, oldDelta, source) {
        if (source !== 'user') return;

        //array of ops for future buffering
        console.log(delta.ops);

        
        sendOp(delta.ops);
        ack = false;
});

function sendOp(ops){
  var xhr = new XMLHttpRequest();
  xhr.open("POST", ("http://azaft.xyz/doc/op/" + docID + "/" + id), true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function(){
    if(this.responseText == "{status: 'retry'}"){
      console.log("retrying");
      sendOp(ops);
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
  xhr.open("POST", ("http://azaft.xyz/doc/presence/" + docID + "/" + id), true);
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

function showSignup(){
  let signup = document.getElementById("signup-menu");
  let login = document.getElementById("login-menu");

  signup.classList.remove("hide-form");
  login.classList.add("hide-form");
}

function handleSignup(){
    let username = document.getElementById("username").value;
    let password = document.getElementById("password").value;
    let email = document.getElementById("email").value;
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    document.getElementById("email").value = "";

    var sendUser = new XMLHttpRequest();
    sendUser.open("POST", "/users/signup", true);
    sendUser.setRequestHeader('Content-Type', 'application/json');
    sendUser.onload = function(){
        let response = JSON.parse(this.responseText);
        console.log(response);
        let signupMessage = document.getElementById("signup-message");

        if(response.message){
          signupMessage.innerHTML = response.message;
          signupMessage.classList.remove("success");
          signupMessage.classList.add("error");
        } else {
          signupMessage.innerHTML = "";
          let signup = document.getElementById("signup-menu");
          let login = document.getElementById("login-menu");

          signup.classList.add("hide-form");
          login.classList.remove("hide-form");

          let loginMessage = document.getElementById("login-message");
          loginMessage.innerHTML = "Verification link sent. Verify to login";
          loginMessage.classList.add("success");
        }
    };
    sendUser.send(JSON.stringify({
        "name": username,
        "password": password,
        "email": email,
        "disabled": true
    }));
}

function handleLogin(){
    let email = document.getElementById("email2").value;
    let password = document.getElementById("password2").value;
    document.getElementById("email2").value = "";
    document.getElementById("password2").value = "";

    var sendUser = new XMLHttpRequest();
    sendUser.open("POST", "/users/login", true);
    sendUser.setRequestHeader('Content-Type', 'application/json');
    sendUser.onload = function(){
        let response = JSON.parse(this.responseText);
        console.log(response);
        let loginMessage = document.getElementById("login-message");

        if(response.message){
          loginMessage.innerHTML = response.message;
          loginMessage.classList.remove("success");
          loginMessage.classList.add("error");
        } else {
          loginMessage.innerHTML = "Login success";
          loginMessage.classList.add("success");
        }
    };

    sendUser.send(JSON.stringify({
        "email": email,
        "password": password
    }));
}

function handleLogout(){
    var sendUser = new XMLHttpRequest();
    sendUser.open("POST", "http://azaft.xyz/users/logout", true);
    sendUser.setRequestHeader('Content-Type', 'application/json');
    sendUser.onload = function(){
        console.log("Signin res: " + this.responseText);
    };

    sendUser.send();
}

function createDoc(){
  let docName = document.getElementById("doc-name").value;
  console.log(docName);

  var xhr = new XMLHttpRequest();
  xhr.open("POST", ("http://azaft.xyz/collection/create"), true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.send(JSON.stringify({
        "name": docName
  }));
}

function deleteDoc(){
  let docID = document.getElementById("doc-id").value;
  console.log(docID);

  var xhr = new XMLHttpRequest();
  xhr.open("POST", ("http://azaft.xyz/collection/delete"), true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.send(JSON.stringify({
        "docid": docID
  }));
}

function openDoc(){
  let docID = document.getElementById("doc-id-open").value;
  console.log("Opening: " + docID);
  localStorage.setItem("documentID", docID);
  window.location.href = '/doc/edit/' + docID;
}

function connectDoc(){

  if(!docID) docID = localStorage.getItem("documentID");

  if(!docID){
    return;
  }

  const uID = Date.now();
  const evtSource = new EventSource("http://azaft.xyz/doc/connect/" + docID + "/" + uID);
  id = uID;

  evtSource.onmessage = function(event) {
    let data = JSON.parse(event.data);
    console.log(data);

    if(data.ack){
      ack = true;
      console.log("ACKNOWLEDGED");
      version++;
    } else if(data.error){
      evtSource.close();
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
    } else {
      if(data.content) {
        version = data.version;
        quill.setContents(data.content);
      } else {
        quill.updateContents(data);
      }
    }
  }
}