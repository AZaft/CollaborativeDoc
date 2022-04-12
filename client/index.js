
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
        toolbar: toolbarOptions
    },

    theme: 'snow'
});



const id = Date.now();
const evtSource = new EventSource("http://209.151.151.250:4000/connect/" + id);

evtSource.onmessage = function(event) {
  let data = JSON.parse(event.data);

  if(data.content) {
    quill.setContents(data.content);
  } else {
    for(let i = 0; i < data.length;i++){
      quill.updateContents(data[i]);
    }
  }

  console.log(data);
}


quill.on('text-change', function (delta, oldDelta, source) {
        if (source !== 'user') return;

        //array of ops for future buffering
        let array_of_ops = [];
        
        array_of_ops.push( delta.ops );
  
        console.log(array_of_ops);

        var xhr = new XMLHttpRequest();
        xhr.open("POST", ("http://209.151.151.250:4000/op/" + id), true);
        xhr.setRequestHeader('Content-Type', 'application/json');


        xhr.send(JSON.stringify(array_of_ops));
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

function handleSignup(){
    let username = document.getElementById("username").value;
    let password = document.getElementById("password").value;
    let email = document.getElementById("email").value;
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    document.getElementById("email").value = "";

    var sendUser = new XMLHttpRequest();
    sendUser.open("POST", "http://209.151.151.250:4000/users/signup", true);
    sendUser.setRequestHeader('Content-Type', 'application/json');
    sendUser.onload = function(){
        console.log("Signin res: " + this.responseText);
    };
    sendUser.send(JSON.stringify({
        "username": username,
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
    sendUser.open("POST", "http://209.151.151.250:4000/users/login", true);
    sendUser.setRequestHeader('Content-Type', 'application/json');
    sendUser.onload = function(){
        console.log("Login res: " + this.responseText);
    };

    sendUser.send(JSON.stringify({
        "email": email,
        "password": password
    }));
}

function handleLogout(){
    var sendUser = new XMLHttpRequest();
    sendUser.open("POST", "http://209.151.151.250:4000/users/logout", true);
    sendUser.setRequestHeader('Content-Type', 'application/json');
    sendUser.onload = function(){
        console.log("Signin res: " + this.responseText);
    };

    sendUser.send();
}