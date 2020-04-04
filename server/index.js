import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import socket from 'socket.io'
import path from 'path'
import morgan from 'morgan'

import E from './events'
import {readFile, updateFile} from "./helpers/fs";

dotenv.config();
const port = process.env.SOCKET_PORT || 5000;
const app = express();

app
  .use('/static', express.static(path.resolve(__dirname, 'public')))
  .use(cors())
  .use(morgan('dev'));

app.get('/users', async function (req, res) {
  const users = await getUsersData();
  res.send(JSON.stringify(users))
});

const server = app.listen(port, function () {
  console.log('Server up and running on port' + port)
});

const io = socket(server);

io.on('connection', function (socket) {
  console.log('user connected', socket.id);

  socket.on(E.CHOOSE_USER_FROM_CLIENT, async ({id}) => {
    socket.broadcast.emit(E.CHOOSE_USER_FROM_SERVER, {id});
    const users = await getUsersData();
    const userAliases = await readFile('socket-user-aliases.json');
    const changedUsers = dispatchEvent(id, users);
    const aliasObject = {
      socketId: socket.id,
      userId: id
    };
    const changedAliases = {...userAliases, aliasObject};
    await updateUsersData(changedUsers);
    await updateAliases(changedAliases);
  });

  socket.on(E.ADD_MESSAGE_FROM_CLIENT, function (message) {
    socket.broadcast.emit(E.ADD_MESSAGE_FROM_SERVER, {message})
  });

  socket.on('disconnect', async function () {
    console.log('user disconnected', socket.id);
    let UID = null;
    const userAliases = await readFile('socket-user-aliases.json');
    userAliases.forEach(({socketId, userId}) => {
      if (socketId === socket.id) {
        UID = userId
      }
    });
    if (UID) {
      socket.broadcast.emit(E.ENABLE_USER_FROM_SERVER, {id: UID});
      const users = await getUsersData();
      const changedUsers = enableUser(UID, users);
      await updateUsersData(changedUsers);
      const changeAliases = [...userAliases.filter(obj => obj.userId !== UID)];
      await updateAliases(changeAliases)
    }
  })
});

function disableUser(id, users) {
  return users.map(user => {
    return user.id === id ? {
      ...user,
      available: false
    } : user;
  })
}

function enableUser(id, users) {
  return users.map(user => {
    return user.id === id ? {
      ...user,
      available: true
    } : user;
  })
}

async function updateUsersData(userData) {
  try {
    await updateFile('users.json', userData);
    return true
  } catch (e) {
    console.log('Error update users', e);
    return false
  }
}

async function updateAliases(aliasesData) {
  try {
    await updateFile('socket-user-aliases.json', aliasesData);
    return true
  } catch (e) {
    console.log('Error update aliases file', e);
    return false
  }
}

async function getUsersData() {
  const data = await readFile('users.json');
  return data
}