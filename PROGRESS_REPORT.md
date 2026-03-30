## Progress Report, Team Invincible

Report Date: March 29, 2026
Last Commit: def66f2, March 25, 2026

### Who is in our group?

Kobe, Devin, Urvish, Brandon.

### What is our project?

We are building a multi user real time room application with user authentication, room management, avatars, a 2D map, and in room activities. We are using Node.js, Express, and Socket.IO.

Right now we have a localhost only chat demo. We do not have a live deployment yet.

### What have we accomplished?

We committed our initial scaffold on March 25, 2026. This includes the following.
An Express server that serves static files and runs Socket.IO on localhost:3000. A basic HTML page with a join form and chat text box. Socket event handlers for joining a room, sending messages, and disconnect notifications. A live member counter. A render.yaml config file for Render deployment (not yet connected). A README with documentation.

Our project has 116 lines of actual code across 4 JavaScript files. The rest of the 463 total lines are comments, blanks, HTML, and CSS. We have 0 test files so far.

When we run it locally and open two browser tabs, we can type a username and room name, send messages and files between tabs, and see a member count update. Added a dice roll function up to a D20. That is the full extent of our current functionality.

### What needs to be done

We have grouped our remaining tasks by priority and assigned them to team members.

#### Must have. Assigned to Urvish.

1. Deploy our app to Render so it has a public URL.
2. Choose and set up a database (MongoDB, PostgreSQL, or SQLite).
3. Add CORS configuration for production deployment.
4. Fix the duplicate room join bug where a user can join multiple rooms and only the last one gets notified on disconnect.

#### Core features. Assigned to Brandon.

5. Store message history so new users can see past messages.
6. Add input validation and rate limiting on the server.
7. Add server logging for requests, events, and errors.
8. Add error handling on both server and client.

#### User system and UI. Assigned to Devin.

9. Build user registration and login.
10. Build a user roster sidebar that shows who is in the room.
11. Show a connection status indicator and handle reconnects.
12. Avatar support for user profiles.
13. UI redesign with responsive layout, better styling, and loading states.

#### Rooms and map. Assigned to Kobe.

14. Build persistent room creation, listing, and joining.
15. Build a room discovery page so users can browse rooms.
16. Add a leave room button and the ability to switch rooms.
17. 2D map for avatar exploration.
18. In room activities (we still need to define the scope for this).

#### Shared

19. Add a test framework and write tests. Each of us will write tests for our own work.
20. Set up a CI/CD pipeline with GitHub Actions. Kobe and Urvish will handle this.

### Responsibility summary

Urvish: Deployment, database setup, CORS, bug fixes.
Brandon: Message history, input validation, rate limiting, logging, error handling.
Devon: User authentication, roster display, connection handling, avatars, UI redesign.
Kobe: Room management, room discovery, room switching, 2D map, in room activities.

### What adjustments do we need to make?

All four of us need to start contributing code through branches and pull requests. We need to set up a database before we can build authentication, rooms, or message history. We will use GitHub Issues to track our 20 tasks listed above.

For the 2D map, we plan to keep the scope minimal. Think Oregon Trail or a bare bones DnD overworld, not a full game engine. We will use a simple grid rendered on an HTML canvas where each user has a character that moves with arrow keys or WASD. Our map will be a 2D array of tile IDs. Each tile will be a colored square or simple sprite. Rooms will be locations on the map that players walk into to join. We will define character traits entirely with integers and other primitives, for example strength as an int, name as a string, color as a hex string. No classes, no complex objects. We will store each character as a flat JSON object like { name: "Kobe", x: 5, y: 3, color: "#ff0000", hp: 10, str: 5, def: 3 }. We will broadcast positions over Socket.IO so all players see each other move in real time. The map itself will be a static JSON file that defines which tiles are walkable, which are walls, and which are room entrances. We will keep it to a single screen with no scrolling to start. This is achievable with canvas drawing calls and a few socket events for position updates without any external game libraries.

### Our plan going forward

1. Deploy our current app to Render.
2. Set up our database.
3. Build user registration and login.
4. Build persistent rooms with create, list, join, and leave.
5. Store and load message history.
6. Add the user roster sidebar.
7. Write tests for everything above.
8. Redesign our UI.
9. Build avatars if time allows.
10. Build the 2D map if time allows.
