import React, { useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react'
import { createEditor, Editor, Transforms, Element as SlateElement } from 'slate'
import { Slate, Editable, withReact, useSlate } from 'slate-react'
import Elements from './Elements'
import './SlateEditor.css'
import io from "socket.io-client";
import $ from "jquery";
import Leaf from './Leaf'
import Button from './Buttons/Button'
import axios from 'axios'
import AuthContext from '../context/AuthContext'
import { Redirect } from 'react-router'
import socketIoClient from 'socket.io-client'
import Peer from "simple-peer";
import styled from "styled-components";
const socket = socketIoClient()

const Container = styled.div`
    padding: 20px;
    display: flex;
    height: 100vh;
    width: 90%;
    margin: auto;
    flex-wrap: wrap;
`;

const StyledVideo = styled.video`
    height: 40%;
    width: 50%;
`;

const Video = (props) => {
    const ref = useRef();

    useEffect(() => {
        props.peer.on("stream", stream => {
            ref.current.srcObject = stream;
        })
    }, []);

    return (
        <StyledVideo playsInline autoPlay ref={ref} />
    );
}


const videoConstraints = {
    height: window.innerHeight / 2,
    width: window.innerWidth / 2
};

const SlateEditor = (props) => {
  const { logged, currentUser } = useContext(AuthContext)
  const queryParams = new URLSearchParams(props.location.search)
  let idCopy;
  for (let param of queryParams.entries()) {
    if (param[0] === 'id') {
      idCopy = param[1]
    }
  }
  const [docId] = useState(idCopy)
  const [title, setTitle] = useState("")
  const [idStatus, setIdStatus] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [errorStatus, setErrorStatus] = useState("")

  const editor = useMemo(() => withReact(createEditor()), [])
  const [value, setValue] = useState([])

  const [timer, setTimer] = useState()

  const [saved, setSaved] = useState()

  const { loggedIn } = useContext(AuthContext)

  const id = useRef(Date.now().toString() + "::UID")
  const [peers, setPeers] = useState([]);
    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]);
    const roomID = docId;
  useEffect(() => {
    socketRef.current = socket;
        navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true }).then(stream => {
            userVideo.current.srcObject = stream;
            socketRef.current.emit("join room", roomID);
            socketRef.current.on("all users", users => {
                const peers = [];
                users.forEach(userID => {
                    const peer = createPeer(userID, socketRef.current.id, stream);
                    peersRef.current.push({
                        peerID: userID,
                        peer,
                    })
                    peers.push(peer);
                })
                setPeers(peers);
            })

            socketRef.current.on("user joined", payload => {
                const peer = addPeer(payload.signal, payload.callerID, stream);
                peersRef.current.push({
                    peerID: payload.callerID,
                    peer,
                })

                setPeers(users => [...users, peer]);
            });

            socketRef.current.on("receiving returned signal", payload => {
                const item = peersRef.current.find(p => p.peerID === payload.id);
                item.peer.signal(payload.signal);
            });
        })
    console.log("==>",docId);
    // $('.fa-window-close').click(function(){
    //   console.log("yes");
    //   // $('.user-chat-box').style.backgroundColor='red';
    //   $(".user-chat-box").attr("style", "display:none")
    //  });
    socket.on("receive_message", function (data) {
      console.log("message recieved ", data.message);
      //automatic scroll down
      $("#chat-messages-list")
        .stop()
        .animate({ scrollTop: $("#chat-messages-list")[0].scrollHeight }, 200);
      let newMessage = $("<li>");
      let messageType = "other-message";
      if (id.current === data.user_email) {
        console.log("SELFFFFF");
        messageType = "self-message";
      }
      newMessage.append(
        $("<span>", {
          html: data.message,
        }),
      );
      newMessage.append(
        $("<sub>", {
          html: data.name,
        }),
      );
      newMessage.addClass(messageType);
      $("#chat-messages-list").append(newMessage);
    });
    if (loggedIn) {
      if (!idCopy) {
        setIdStatus("false")
      } else {
        async function getSingleDoc() {
          try {
            const doc = await axios.get(`/api/docs/${docId}`)
            setValue(doc.data.data.doc.content)
            setTitle(doc.data.data.doc.name)
            setSaved(true)
          } catch (err) {
            setErrorStatus(err.response.status)
            setErrorMessage(err.response.data.message)
          }
        }

        getSingleDoc()

        socket.on('new-remote-operations', ({ editorId, operations, documentId }) => {
          if (editorId !== id.current && documentId === docId) {
            Editor.withoutNormalizing(editor, () => {
              operations.forEach(operation => {
                if (editor !== null) {
                  editor.apply(operation)
                } else {
                  console.log("its null!")
                }
              })
            })
          }
        })

      }
    }

  }, [docId])
  function createPeer(userToSignal, callerID, stream) {
    const peer = new Peer({
        initiator: true,
        trickle: false,
        stream,
    });

    peer.on("signal", signal => {
        socketRef.current.emit("sending signal", { userToSignal, callerID, signal })
    })

    return peer;
}

function addPeer(incomingSignal, callerID, stream) {
    const peer = new Peer({
        initiator: false,
        trickle: false,
        stream,
    })

    peer.on("signal", signal => {
        socketRef.current.emit("returning signal", { signal, callerID })
    })

    peer.signal(incomingSignal);

    return peer;
}
  const togglePopup = ()=> {
    $("#user-chat-box").toggle();
    $('.toggleChat').toggle();
  };
  const toggleVideoFunction = ()=> {
    $("#video-chat-box").toggle();
  };
  const sendMessage = () => {
    console.log("clicked");
    let msg = document.getElementById("chat-message-input").value;
    //automatic scroll
    $("#chat-messages-list")
      .stop()
      .animate({ scrollTop: $("#chat-messages-list")[0].scrollHeight }, 200);
    if (msg !== "") {
      document.getElementById("chat-message-input").value = "";
      socket.emit("send_message", {
        message: msg,
        user_email: id.current,
        chatroom: docId,
        name:currentUser.username
      });
    }
  };
  $("#chat-message-input").on("keypress", function (e) {
    console.log(e.which);
    //ascii code of enter key is 13
    if (e.which === 13) {
      let msg = $("#chat-message-input").val();

      //automatic scroll down as user sends a new msg
      $("#chat-messages-list")
        .stop()
        .animate({ scrollTop: $("#chat-messages-list")[0].scrollHeight }, 200);

      if (msg !== "") {
        console.log(msg);
        $("#chat-message-input").val("");
        socket.emit("send_message", {
          message: msg,
          user_email: id.current,
          chatroom: docId,
          name:currentUser.username
        });
      }
    }
  });
  const renderElement = useCallback(props => {

    if (props.element.type === "heading-one") {
      return <Elements {...props} />
    }
    if (props.element.type === "heading-two") {
      return <Elements {...props} />
    } else {
      return <Elements {...props} />
    }

  }, [])

  const renderLeaf = useCallback(props => {
    return <Leaf {...props} />

  }, [])

  const saveDocHandler = (value) => {
    async function saveDoc() {
      try {
        await axios.patch(`/api/docs/${docId}`, {
          content: value
        })

        setSaved(true)
      } catch (err) {
        setErrorStatus(err.response.status)
        setErrorMessage(err.response.data.message)
      }
    }

    saveDoc()
  }

  return (

    <div className="base-div" >
    {/* <button onClick={togglePopup} className="toggleChat">Start Chatting</button> */}
    {/* <button onClick={toggleVideoFunction} className="toggleVideo">Toggle Video</button> */}
      {
        loggedIn && errorMessage === "You are not authorised to access this document!"
          ? <Redirect to={{ pathname: "/permission", state: { message: errorMessage, docId } }} />
          : null
      }

      {
        (loggedIn && errorMessage !== "You are not authorised to access this document!" && errorMessage !== "")
          ? <Redirect to={{ pathname: "/error", state: { message: errorMessage, statusCode: errorStatus } }} />
          : null
      }

      {
        loggedIn && idStatus === "false" ? <Redirect to="/" /> : null
      }

      {
        loggedIn ? null : <Redirect to="/login" />
      }

      <div className="doc-info" >
        <h3 className="doc-title" >{title}</h3>

        <div>
          {
            saved
              ? <p style={{ color: "green" }} >Saved</p>
              : <p></p>
          }
        </div>

        <button
          disabled={!value}
          className="save-button"
          onClick={() => saveDocHandler(value)}
        >
          <span className="material-icons" >
            save
          </span>
        </button>

      </div>

      <Slate editor={editor} value={value} onChange={
        (value) => {
          setValue(value)
          //setSaved(false)

          //console.log(editor.operations)
          editor.operations.forEach(
            operation => {
              if (operation.type !== "set_selection" && operation.type !== "set_value") {
                //console.log("performed")
                const saveState = () => {
                  if (saved) {
                    setSaved(false)
                    //console.log("saved: false")
                  }
                }

                saveState()
              }
            }
          )


          const filterOps = editor.operations.filter(o => {
            //console.log(o)
            if (o === null) {
              //console.log("this was null")
              return false
            }

            const is_sourced = (o.data != null) && ("source" in o.data)
            return (
              o.type !== "set_selection" &&
              o.type !== "set_value" &&
              (!is_sourced)
            )

          })
            .map(o => ({ ...o, data: { source: "one" } }))

          //console.log(filterOps)
          if (filterOps.length > 0) {
            socket.emit("new-operations", {
              editorId: id.current,
              operations: filterOps,
              documentId: docId
            })
          }

        }
      }
      >

        <div className="toolbar" >

          <MarkButton format="bold" icon="format_bold"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer} />

          <MarkButton format="italic" icon="format_italic"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer}
          />

          <MarkButton format="underline" icon="format_underline"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer}
          />

          <MarkButton format="code" icon="code"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer}
          />

          <MarkButton format="uppercase" icon="keyboard_arrow_up"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer}
          />

          <MarkButton format="lowercase" icon="keyboard_arrow_down"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer}
          />


          <BlockButton format="heading-one" icon="looks_one"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer}
          />

          <BlockButton format="heading-two" icon="looks_two"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer}
          />

          <BlockButton format="left" icon="format_align_left"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer}
          />

          <BlockButton format="center" icon="format_align_center"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer}
          />

          <BlockButton format="right" icon="format_align_right"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer}
          />

          <BlockButton format="justify" icon="format_align_justify"
            saveDoc={saveDocHandler}
            timer={timer}
            setTimer={setTimer}
          />

        </div>

        <Editable
          renderElement={renderElement}
          renderLeaf={renderLeaf}

          onKeyUp={
            () => {
              if (timer) {
                window.clearTimeout(timer)
              }

              setTimer(setTimeout(() => {
                //console.log("done")
                saveDocHandler(value)
              }, 1000))

            }
          }

          onKeyPress={
            () => {
              if (timer) {
                window.clearTimeout(timer)
              }
              //console.log("typing")
            }
          }


          onKeyDown={event => {

            if (!event.ctrlKey) {
              return
            }

            switch (event.key) {

              case 'b':
                event.preventDefault()
                toggleMark(editor, "bold")
                break

              case 'i':
                event.preventDefault()
                toggleMark(editor, "italic")
                break

              case 'u':
                event.preventDefault()
                toggleMark(editor, "underline")
                break

              case '`':
                event.preventDefault()
                toggleMark(editor, "code")
                break

              default: break

            }
          }}
        />
      </Slate>
      <Container>
            <StyledVideo muted ref={userVideo} autoPlay playsInline id="video-chat-box" style={{display:'none'}}/>
            {peers.map((peer, index) => {
                return (
                    <Video key={index} peer={peer} />
                );
            })}
        </Container>
      <div id="user-chat-box" >
      <div onClick={togglePopup} className="close-btn" style={{cursor:'pointer'}}>
            ×
        </div>
        <h2>Public Chat Room</h2>
        <div id="feedback"></div>
        <ul id="chat-messages-list">
          <li className="other-message"></li>
          <li className="self-message"></li>
        </ul>

        <div id="chat-message-input-container">
          <input id="chat-message-input" placeholder="Type your msg here..." />
          <button id="send-message" onClick={sendMessage}>
            Send
          </button>
        </div>
      </div>
    </div>
  
  )
}

const MarkButton = ({ format, icon, saveDoc, timer, setTimer }) => {
  const editor = useSlate()
  return (
    <Button
      active={isMarkActive(editor, format)}
      onMouseDown={(e) => {
        e.preventDefault()
        toggleMark(editor, format)
        if (timer) {
          window.clearTimeout(timer)
        }

        setTimer(setTimeout(() => {
          saveDoc(editor.children)
        }, 1000))

      }}

      icon={icon}
    />
  )
}

const BlockButton = ({ format, icon, saveDoc, timer, setTimer }) => {
  const editor = useSlate()
  return (
    <Button
      active={isBlockActive(editor, format)}
      onMouseDown={(e) => {
        e.preventDefault()
        toggleBlock(editor, format)
        if (timer) {
          window.clearTimeout(timer)
        }

        setTimer(setTimeout(() => {
          saveDoc(editor.children)
        }, 1000))
      }}
      icon={icon}
    />
  )
}

const isMarkActive = (editor, format) => {
  let marks = Editor.marks(editor)
  let returnValue = marks ? marks[format] === true : false
  return returnValue
}

const toggleMark = (editor, format) => {
  const isActive = isMarkActive(editor, format)

  if (isActive) {
    Editor.removeMark(editor, format)
  } else {
    Editor.addMark(editor, format, true)
  }

}

const isBlockActive = (editor, format) => {
  const [match] = Editor.nodes(
    editor,
    {
      match: node => {
        return !Editor.isEditor(node) && SlateElement.isElement(node) && node.type === format
      }
    }
  )

  return !!match
}

const toggleBlock = (editor, format) => {
  const isActive = isBlockActive(editor, format)

  Transforms.setNodes(
    editor,
    { type: isActive ? 'paragraph' : format },
    { match: node => Editor.isBlock(editor, node) }
  )
}


export default SlateEditor;