
document.addEventListener("DOMContentLoaded", () => {
  if(localStorage.getItem("user") != null){
    document.getElementById("registration").classList.add("hide-form");
    document.getElementById("main-app").classList.remove("hide-form");
    showRecent();

    document.getElementById("search-input")
    .addEventListener("keyup", function(event) {
      event.preventDefault();
      if (event.keyCode === 13) {
          searchDoc();
      }
    });
  }
});

function showSignup(){
  let signup = document.getElementById("signup-menu");
  let login = document.getElementById("login-menu");

  signup.classList.remove("hide-form");
  login.classList.add("hide-form");
}

function showLogin(){
  let signup = document.getElementById("signup-menu");
  let login = document.getElementById("login-menu");

  signup.classList.add("hide-form");
  login.classList.remove("hide-form");
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
          
          showLogin();

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
          document.getElementById("registration").classList.add("hide-form");
          document.getElementById("main-app").classList.remove("hide-form");
          localStorage.setItem("user", response);
          showRecent();
        }
    };

    sendUser.send(JSON.stringify({
        "email": email,
        "password": password
    }));
}

function handleLogout(){
    var sendUser = new XMLHttpRequest();
    sendUser.open("POST", "/users/logout", true);
    sendUser.setRequestHeader('Content-Type', 'application/json');
    sendUser.onload = function(){
        console.log("Signin res: " + this.responseText);
        localStorage.removeItem("user");
        document.getElementById("registration").classList.remove("hide-form");
        document.getElementById("main-app").classList.add("hide-form");
    };

    sendUser.send();
}

function createDoc(){
  let docName = document.getElementById("doc-name").value;
  var xhr = new XMLHttpRequest();
  xhr.open("POST", ("/collection/create"), true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function(){
        let response = JSON.parse(this.responseText);
        console.log(response);
        docName.value = "";
        setTimeout(function(){
          showRecent();
        }, 100);
  };

  xhr.send(JSON.stringify({
        "name": docName
  }));
}

function deleteDoc(event){
  let docID = event.target.parentNode.id;
  console.log("Deleting" + docID);

  var xhr = new XMLHttpRequest();
  xhr.open("POST", ("/collection/delete"), true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function(){
        let response = JSON.parse(this.responseText);
        console.log(response);
        event.target.parentNode.remove();
        showRecent();
  };

  xhr.send(JSON.stringify({
        "docid": docID
  }));
}

function getHTML(event){
  let docID = event.target.parentNode.id;
  window.location.href = '/doc/get/' + docID + "/" + "default";
}

function openDoc(event){
  let docID = event ? event.target.parentNode.id : document.getElementById("doc-id-open").value;
  
  console.log("Opening: " + docID);
  window.location.href = '/doc/edit/' + docID;
}


function showRecent(){
  //get request for top 10 most recent docs
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/collection/list", true);
    xhr.onload = function(){
        let response = JSON.parse(this.responseText);
        console.log(response);
        if(response.error) handleLogout();
        if(response.length){
          let recentDocs = document.getElementById("recent-docs");
          recentDocs.innerHTML = "";
          for(let i = 0;i < response.length;i++){
            let modifiedDate = new Date(response[i].modified);
            let time = modifiedDate.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
            let dateString = modifiedDate.getMonth() + 1 + "/" + modifiedDate.getDate() + "/" + modifiedDate.getFullYear() + " " +  time;
            
            let element = createDocElement(response[i].name, response[i].id, response[i].user, dateString, null,"Modified");
            recentDocs.append(element);
          }    
        }
    };

    xhr.send(null);
}

function searchDoc(){
  let searchInput = document.getElementById("search-input");
  let query = searchInput.value;
  console.log(query);

  var xhr = new XMLHttpRequest();
    xhr.open("GET", "/index/search?q=" + query, true);
    xhr.onload = function(){
        let response = JSON.parse(this.responseText);
        console.log(response);
        let recentDocs = document.getElementById("search-results");
        recentDocs.innerHTML = "";
        if(response.length){
          for(let i = 0;i < response.length;i++){
            let createdDate = new Date(response[i].created);
            let time = createdDate.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
            let dateString = createdDate.getMonth() + 1 + "/" + createdDate.getDate() + "/" + createdDate.getFullYear() + " " +  time;
            
            let element = createDocElement(response[i].name, response[i].docid, response[i].author, dateString, response[i].snippet, "Created");
            
            recentDocs.append(element);
          }    
        }

    };

    xhr.send(null);
}

function createDocElement(dName, docID, uName, mTime, snippet, dateType){
  let doc = document.createElement("div");
  doc.classList.add("doc");
  doc.setAttribute("id", docID);

  let docName = document.createElement("span");
  docName.innerHTML = "<span style=\"font-weight:bold\">" +  dName + "</span> <br>";

  let modifiedTime = document.createElement("span");
  modifiedTime.innerHTML = dateType + ": <span style=\"color:darkgreen;font-weight:bold\">" + mTime +  "</span> <br>";

  let userName = document.createElement("span");
  userName.innerHTML = "By: <span style=\"color:darkgreen;font-weight:bold\">" + uName + "</span>";

  let openButton = document.createElement("button");
  openButton.classList.add("doc-button");
  openButton.innerHTML = "open";
  openButton.onclick = function() {openDoc(event)};

  let deleteButton = document.createElement("button");
  deleteButton.classList.add("doc-button");
  deleteButton.innerHTML = "delete";
  deleteButton.onclick = function() {showDeleteModal(event)};

  let htmlButton = document.createElement("button");
  htmlButton.classList.add("doc-button");
  htmlButton.innerHTML = "HTML";
  htmlButton.onclick = function() {getHTML(event)};

  let snippetElement;
  if(snippet){
    snippetElement = document.createElement("span");
    snippetElement.innerHTML = "<br>\"" + snippet + "\"";
  }

  doc.append(docName);
  doc.append(modifiedTime);
  doc.append(userName);
  
  
  doc.append(htmlButton);
  doc.append(deleteButton);
  doc.append(openButton);

  if(snippet) doc.append(snippetElement);

  let line = document.createElement("br");
  doc.append(line);

  return doc;
}

function showDeleteModal(event){
  let modal = document.getElementById("delete-modal");
  let children = modal.children;
  children[0].innerHTML = "Delete " + event.target.parentNode.id + "?";
  children[1].onclick = function() {modal.classList.add("hide-form"), deleteDoc(event);};
  children[2].onclick = function() {modal.classList.add("hide-form");};
  modal.classList.remove("hide-form");
}