const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = require('http').Server(app);
const io = new Server(server, {
    cors: { origin: '*' } // Allow connections from any client
});

app.use(express.static('../Client'));

let penguins = {};
let seats = [];
let findFourGame = {}

function getClientIp(socket) {
    const req = socket.request;
    return req.connection.remoteAddress || req.socket.remoteAddress;
}

function getHighestFreeRow(columnIndex)
{
    for (let row = findFourGame.state.length - 1; row >= 0; row--) {
        if (findFourGame.state[row][columnIndex] === 0) {
            return row;
        }
    }
    return -1;
}

function hasWonHorz(tokenValue)
{
    var tokensInRow = 0;
    for (let y = findFourGame.state.length - 1; y >= 0; y--) {
        for (let x = findFourGame.state[y].length - 1; x >= 0; x--) {
            if (findFourGame.state[y][x] === tokenValue) {
                tokensInRow++;

                if(tokensInRow == 4)
                {
                    return true;
                }
            }
            else {
                tokensInRow = 0;
            }
        }

        tokensInRow = 0;
    }

    return false;
}

function hasWonVert(tokenValue)
{
    var tokensInRow = 0;
    for (let x = findFourGame.state[0].length - 1; x >= 0; x--) {
        for (let y = findFourGame.state.length - 1; y >= 0; y--) {
            if (findFourGame.state[y][x] === tokenValue) {
                tokensInRow++;

                if(tokensInRow == 4)
                {
                    return true;
                }
            }
            else {
                tokensInRow = 0;
            }
        }

        tokensInRow = 0;
    }

    return false;
}

function hasWonDiag(tokenValue) {
    let rows = findFourGame.state.length;
    let cols = findFourGame.state[0].length;

    // Check \ diagonal (bottom-left to top-right)
    for (let y = 0; y <= rows - 4; y++) {
        for (let x = 0; x <= cols - 4; x++) {
            if (
                findFourGame.state[y][x] === tokenValue &&
                findFourGame.state[y + 1][x + 1] === tokenValue &&
                findFourGame.state[y + 2][x + 2] === tokenValue &&
                findFourGame.state[y + 3][x + 3] === tokenValue
            ) {
                return true;
            }
        }
    }

    // Check / diagonal (bottom-right to top-left)
    for (let y = 0; y <= rows - 4; y++) {
        for (let x = 3; x < cols; x++) {
            if (
                findFourGame.state[y][x] === tokenValue &&
                findFourGame.state[y + 1][x - 1] === tokenValue &&
                findFourGame.state[y + 2][x - 2] === tokenValue &&
                findFourGame.state[y + 3][x - 3] === tokenValue
            ) {
                return true;
            }
        }
    }

    return false;
}

function hasWon(tokenValue)
{
    return hasWonHorz(tokenValue) || hasWonVert(tokenValue) || hasWonDiag(tokenValue);
}

function setSeatStatus(x, y, status, socketId) 
{
    let seat = seats.find(s => s.x === x && s.y === y);
    if (!seat) {
        seat = { x, y, filled: status, socketId };
        seats.push(seat);
    } else {
        seat.filled = status;
        seat.socketId = socketId;
    }

    console.log(seats)
    console.log("Seat @ (" + x + ", " + y + ") is " + (status ? "filled" : "empty" ));
    io.emit('message', { action: "seat", payload: { id: socketId, ...seat }});
}

function isValidHexColor(color) {
    return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

function leaveSeat(socketId)
{
    let seat = seats.find(s => s.socketId === socketId);
    if (seat) {
        seat.status = false;
        seat.socketId = null;
        
        setSeatStatus(seat.x, seat.y, false, null)

        checkLeftGame(penguins[socketId].username)
    }
}

io.on('connection', (socket) => {
    const clientIp = getClientIp(socket);
    console.log(`Player connected: ${socket.id} with Ip ${clientIp}`);

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        leaveSeat(socket.id);
        delete penguins[socket.id];
        io.emit('message',{ action: "disconnected", payload: { id: socket.id } });
    });

    socket.on('message', (message) => {
        if(message.action === 'login')
        {
            penguins[socket.id] = { username: message.payload.username, x: 777, y: 537 };
            io.emit('message', { action: "connected", payload: { id: socket.id, username: penguins[socket.id].username, x:penguins[socket.id].x, y: penguins[socket.id].y }});        
        }

        if(message.action === 'move')
        {
            if(!penguins[socket.id]) return;
            leaveSeat(socket.id);
            console.log("recieved moved event");
            penguins[socket.id].direction = null;
            penguins[socket.id].x = message.payload.x;
            penguins[socket.id].y = message.payload.y;
            io.emit('message', { action: "move", payload: { id: socket.id, x: message.payload.x, y: message.payload.y }});
        }

        if(message.action === 'sit')
        {
            if(!penguins[socket.id]) return;
            console.log("recieved sit event");
            penguins[socket.id].direction = message.payload.direction;
            io.emit('message', { action: "sit", payload: { id: socket.id, direction: message.payload.direction }});
        }

        if(message.action === 'init')
        {
            console.log("Recieved init!")
            Object.keys(penguins).forEach(key => {
                if(key == socket.id) return;
                socket.emit('message', { action: "connected", payload: 
                    { 
                        id: key, 
                        username: penguins[key].username,
                        x: penguins[key].x, 
                        y: penguins[key].y,
                        direction: penguins[key].direction,
                        color: penguins[key].color,
                        faceItemId: penguins[key].faceItemId
                    }});
            });
        }

        if(message.action === 'chat')
        {
            console.log("Recieved chat! " + message.payload.msg)
            var msg = message.payload.msg;
            if(msg.startsWith('!'))
            {
                if(msg.startsWith('!data'))
                {
                    console.log(penguins)
                }

                if(msg.startsWith('!color '))
                {
                    const args = msg.split(' ');
                    if(args.length < 1) return;
                    const color = args[1]; 

                    if(!isValidHexColor(color)) return;

                    var key = socket.id;
                    penguins[key].color = color;
                    io.emit('message', { action: "updatePenguin", payload: 
                        { 
                            id: key, 
                            username: penguins[key].username,
                            x: penguins[key].x, 
                            y: penguins[key].y,
                            direction: penguins[key].direction,
                            color: penguins[key].color,
                            faceItemId: penguins[key].faceItemId
                        }});
                }

                if(msg.startsWith('!username '))
                {
                    const args = msg.split(' ');
                    if(args.length < 1) return;
                    const username = args[1]; 

                    var key = socket.id;
                    penguins[key].username = username;
                    io.emit('message', { action: "updatePenguin", payload: 
                        { 
                            id: key, 
                            username: penguins[key].username,
                            x: penguins[key].x, 
                            y: penguins[key].y,
                            direction: penguins[key].direction,
                            color: penguins[key].color,
                            faceItemId: penguins[key].faceItemId
                        }});
                }

                if(msg.startsWith('!ninja'))
                {
                    var key = socket.id;
                    penguins[key].faceItemId = '104';
                    io.emit('message', { action: "updatePenguin", payload: 
                        { 
                            id: key, 
                            username: penguins[key].username,
                            x: penguins[key].x, 
                            y: penguins[key].y,
                            direction: penguins[key].direction,
                            color: penguins[key].color,
                            faceItemId: penguins[key].faceItemId
                        }});
                }

                if(msg.startsWith('!party'))
                {
                    var key = socket.id;
                    penguins[key].faceItemId = '413';
                    io.emit('message', { action: "updatePenguin", payload: 
                        { 
                            id: key, 
                            username: penguins[key].username,
                            x: penguins[key].x, 
                            y: penguins[key].y,
                            direction: penguins[key].direction,
                            color: penguins[key].color,
                            faceItemId: penguins[key].faceItemId
                        }});
                }

                if(msg.startsWith('!puffle'))
                {
                    var key = socket.id;
                    penguins[key].faceItemId = 'green';
                    io.emit('message', { action: "updatePenguin", payload: 
                        { 
                            id: key, 
                            username: penguins[key].username,
                            x: penguins[key].x, 
                            y: penguins[key].y,
                            direction: penguins[key].direction,
                            color: penguins[key].color,
                            faceItemId: penguins[key].faceItemId
                        }});
                }
            }

            io.emit('message', { action: "chat", payload: { id: socket.id, msg: message.payload.msg }});
        }

        if(message.action === 'seat')
        {
            // We should track the status of the seats...
            setSeatStatus(message.payload.x, message.payload.y, true, socket.id)
        }
    });
});

server.listen(80, () => {
    console.log('WebSocket server running on port 80');
});