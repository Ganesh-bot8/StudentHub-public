
"use strict";

// ==========================================
// STUDENTHUB - CONFIGURATION
// ==========================================
const API_BASE = "https://studenthub-api-ucq9.onrender.com";

const navLinks = document.querySelectorAll(".nav-link");
const mainContent = document.querySelector(".main");

const dashboardHTML = mainContent ? mainContent.innerHTML : "";

let currentUser = null;


// ==========================================
// SESSION MANAGEMENT
// ==========================================

async function checkLoginSession() {
    try {
        const response = await fetch(`${API_BASE}/api/me`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            currentUser = null;
            updateAccountDisplay();
            return;
        }

        const data = await response.json();

        currentUser = data.user || null;

        updateAccountDisplay();

    } catch (error) {
        console.error("Session check failed:", error);

        currentUser = null;
        updateAccountDisplay();
    }
}


// ==========================================
// UPDATE USER DETAILS EVERYWHERE
// ==========================================

function updateAccountDisplay() {

    const userName = currentUser
        ? currentUser.full_name || currentUser.name || "User"
        : "Guest";

    const topbarName = document.getElementById("topbar-user-name");

    if (topbarName) {
        topbarName.textContent = userName;
    }

    const accountType = document.getElementById("topbar-account-type");

    if (accountType) {
        accountType.textContent = currentUser ? "Account" : "Guest Mode";
    }

    const avatar = document.getElementById("topbar-avatar");

    if (avatar) {
        avatar.textContent = userName.charAt(0).toUpperCase();
    }

    const welcomeHeading = document.getElementById("welcome-heading");

    if (welcomeHeading) {
        welcomeHeading.textContent = currentUser
            ? `Welcome back, ${userName} 👋`
            : "Welcome to StudentHub 👋";
    }

    const sidebar = document.querySelector(".sidebar");

    if (!sidebar) return;

    let accountBox = document.getElementById("studenthub-account");

    if (!accountBox) {
        accountBox = document.createElement("div");
        accountBox.id = "studenthub-account";

        accountBox.style.cssText = `
            padding: 15px;
            margin: 15px;
            background: #f1f3f8;
            border-radius: 10px;
            font-size: 13px;
            color: #344054;
        `;

        sidebar.appendChild(accountBox);
    }

    accountBox.innerHTML = "";

    const heading = document.createElement("strong");
    const details = document.createElement("p");

    details.style.marginTop = "6px";

    if (currentUser) {

        heading.textContent = "Logged in";
        details.textContent = userName;

        accountBox.appendChild(heading);
        accountBox.appendChild(details);

    } else {

        heading.textContent = "Guest Mode";
        details.textContent = "Explore StudentHub";

        accountBox.appendChild(heading);
        accountBox.appendChild(details);

        const loginLink = document.createElement("a");

        loginLink.href = "login.html";
        loginLink.textContent = "Login";
        loginLink.style.cssText =
            "color:#3867e8;text-decoration:none;font-weight:bold;";

        const separator = document.createTextNode(" | ");

        const registerLink = document.createElement("a");

        registerLink.href = "register.html";
        registerLink.textContent = "Register";
        registerLink.style.cssText =
            "color:#3867e8;text-decoration:none;font-weight:bold;";

        accountBox.appendChild(loginLink);
        accountBox.appendChild(separator);
        accountBox.appendChild(registerLink);
    }
}


// ==========================================
// LOGOUT
// ==========================================

async function logoutUser() {

    try {

        const response = await fetch(`${API_BASE}/api/logout`, {
            method: "POST",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("Logout failed.");
        }

        currentUser = null;

        window.location.href = "index.html";

    } catch (error) {

        console.error("Logout error:", error);

        alert("Unable to logout. Please try again.");
    }
}


// Check session when dashboard opens
checkLoginSession();


// ==========================================
// MARKDOWN FORMATTER FOR GEMINI
// ==========================================

function formatMarkdown(text) {

    let safe = String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    safe = safe.replace(
        /`([^`]+)`/g,
        "<code style='background:#e9edf5;padding:3px 6px;border-radius:4px;'>$1</code>"
    );

    safe = safe.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
    safe = safe.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
    safe = safe.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

    safe = safe.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\*(.+?)\*/g, "<em>$1</em>");
    safe = safe.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");
    safe = safe.replace(/__(.+?)__/g, "<strong>$1</strong>");

    const lines = safe.split("\n");
    const output = [];

    let listType = null;

    function closeList() {
        if (listType) {
            output.push(listType === "ul" ? "</ul>" : "</ol>");
            listType = null;
        }
    }

    for (const line of lines) {

        const bullet = line.match(/^\s*[-•]\s+(.+)$/);
        const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);

        if (bullet) {

            if (listType !== "ul") {
                closeList();

                output.push("<ul style='padding-left:24px;margin:10px 0;'>");

                listType = "ul";
            }

            output.push("<li>" + bullet[1] + "</li>");

        } else if (numbered) {

            if (listType !== "ol") {
                closeList();

                output.push("<ol style='padding-left:24px;margin:10px 0;'>");

                listType = "ol";
            }

            output.push("<li>" + numbered[1] + "</li>");

        } else {

            closeList();

            output.push(line);
        }
    }

    closeList();

    return output.join("<br>");
}


// ==========================================
// NAVIGATION HELPERS
// ==========================================

function setActiveLink(selectedLink) {

    navLinks.forEach(link => link.classList.remove("active"));

    if (selectedLink) {
        selectedLink.classList.add("active");
    }
}


function openWorkspace(title, description, content) {

    if (!mainContent) return;

    mainContent.innerHTML = `
        <section style="
            min-height:80vh;
            background:#f5f7fc;
            padding:25px;
            box-sizing:border-box;
        ">

            <div style="max-width:1050px;margin:auto;">

                <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    gap:15px;
                    flex-wrap:wrap;
                    margin-bottom:25px;
                ">

                    <div>
                        <h1 style="color:#20283b;margin:0 0 8px;">
                            ${title}
                        </h1>

                        <p style="color:#8490a5;margin:0;">
                            ${description}
                        </p>
                    </div>

                    <button id="back-dashboard" style="
                        background:#596ce5;
                        color:white;
                        border:0;
                        padding:12px 20px;
                        border-radius:8px;
                        cursor:pointer;
                    ">
                        ← Back to Dashboard
                    </button>

                </div>

                ${content}

            </div>
        </section>
    `;

    document.getElementById("back-dashboard")
        .addEventListener("click", showDashboard);
}


function showDashboard() {

    if (!mainContent) return;

    mainContent.innerHTML = dashboardHTML;

    const dashboardLink = [...navLinks].find(link =>
        link.textContent.trim().includes("Dashboard")
    );

    setActiveLink(dashboardLink);

    updateAccountDisplay();
}


// ==========================================
// CAREER ROADMAPS
// ==========================================

function openCareerRoadmaps() {

    const content = `
        <div style="
            background:white;
            padding:22px;
            border-radius:14px;
            box-shadow:0 4px 18px rgba(0,0,0,0.05);
        ">

            <h2 style="color:#20283b;margin-top:0;">
                Choose a career path
            </h2>

            <p style="color:#8490a5;">
                Select a roadmap to see a beginner-friendly learning sequence.
            </p>

            <label for="roadmap-choice" style="
                display:block;
                color:#344054;
                font-weight:600;
                margin:18px 0 8px;
            ">
                Career path
            </label>

            <select id="roadmap-choice" style="
                width:100%;
                max-width:420px;
                padding:12px;
                border:1px solid #dce1ed;
                border-radius:8px;
                background:white;
            ">
                <option value="ai">AI / Machine Learning</option>
                <option value="web">Web Development</option>
                <option value="python">Python Developer</option>
                <option value="java">Java Developer</option>
            </select>

            <div id="roadmap-result" style="margin-top:22px;"></div>

        </div>
    `;

    openWorkspace(
        "Career Roadmaps",
        "Plan what to learn, step by step, for your chosen career.",
        content
    );

    const roadmaps = {

        ai: {
            heading: "AI / Machine Learning Roadmap",
            intro: "Build programming and mathematics foundations before moving into machine learning.",
            steps: [
                ["1. Python basics", "Variables, data types, conditions, loops, functions and basic problem solving."],
                ["2. Mathematics foundations", "Learn basic algebra, statistics, probability and vectors."],
                ["3. Data handling", "Practise working with CSV files, tables and simple data cleaning."],
                ["4. Machine learning basics", "Understand datasets, training, testing, classification and regression."],
                ["5. Build small projects", "Create beginner projects such as a marks predictor or simple classification demo."],
                ["6. Build a portfolio", "Document your projects, explain what you learned and publish your code."]
            ]
        },

        web: {
            heading: "Web Development Roadmap",
            intro: "Start with browser basics, then learn how to build and connect complete websites.",
            steps: [
                ["1. HTML", "Learn page structure, headings, links, images, forms and semantic elements."],
                ["2. CSS", "Learn selectors, box model, flexbox, grid and responsive layouts."],
                ["3. JavaScript", "Learn variables, functions, arrays, objects, events and DOM manipulation."],
                ["4. Git and GitHub", "Track changes and publish beginner projects."],
                ["5. Backend basics", "Learn a backend language and how APIs and databases work."],
                ["6. Build projects", "Create a portfolio, task tracker and a small full-stack application."]
            ]
        },

        python: {
            heading: "Python Developer Roadmap",
            intro: "Learn core Python first, then practise automation, APIs and database-backed projects.",
            steps: [
                ["1. Python fundamentals", "Variables, input/output, data types, conditions and loops."],
                ["2. Core programming", "Functions, lists, dictionaries, sets, tuples and strings."],
                ["3. Files and errors", "Read and write files and handle exceptions."],
                ["4. Modules and packages", "Use imports, virtual environments and pip."],
                ["5. APIs and databases", "Understand HTTP requests and basic SQL."],
                ["6. Projects", "Build a command-line tool, a Flask app and a small automation project."]
            ]
        },

        java: {
            heading: "Java Developer Roadmap",
            intro: "Build a strong foundation in Java syntax and object-oriented programming.",
            steps: [
                ["1. Java basics", "Variables, data types, operators, input/output and conditions."],
                ["2. Loops and methods", "Use loops, write methods and solve small problems."],
                ["3. Object-oriented programming", "Understand classes, objects, constructors, inheritance and interfaces."],
                ["4. Collections", "Learn arrays, ArrayList, HashMap and basic generics."],
                ["5. Problem solving", "Practise strings, arrays, searching and sorting."],
                ["6. Projects", "Build a student record manager or a simple library management app."]
            ]
        }
    };

    function renderRoadmap(key) {

        const roadmap = roadmaps[key];
        const result = document.getElementById("roadmap-result");

        if (!result || !roadmap) return;

        result.innerHTML = `
            <h2 style="color:#20283b;">
                ${roadmap.heading}
            </h2>

            <p style="color:#8490a5;">
                ${roadmap.intro}
            </p>

            <div style="display:grid;gap:12px;margin-top:18px;">

                ${roadmap.steps.map(step => `
                    <article style="
                        padding:16px;
                        border:1px solid #e5e9f2;
                        border-radius:10px;
                        background:#fbfcff;
                    ">

                        <h3 style="
                            margin:0 0 7px;
                            color:#3446a8;
                            font-size:16px;
                        ">
                            ${step[0]}
                        </h3>

                        <p style="
                            margin:0;
                            color:#667085;
                            line-height:1.6;
                        ">
                            ${step[1]}
                        </p>

                    </article>
                `).join("")}

            </div>

            <p style="margin-top:18px;color:#8490a5;font-size:13px;">
                This is a starter learning guide. You can adjust the order and pace as you progress.
            </p>
        `;
    }

    const choice = document.getElementById("roadmap-choice");

    choice.addEventListener("change", () => {
        renderRoadmap(choice.value);
    });

    renderRoadmap(choice.value);
}


// ==========================================
// AI CAREER MENTOR
// ==========================================

function openCareerMentor() {

    if (!mainContent) return;

    mainContent.innerHTML = `
        <section style="
            min-height:90vh;
            background:#f5f7fc;
            padding:25px;
            box-sizing:border-box;
        ">

            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                flex-wrap:wrap;
                gap:15px;
                margin-bottom:25px;
            ">

                <div>
                    <h1 style="color:#20283b;margin:0;">
                        ✧ AI Career Mentor
                    </h1>

                    <p style="color:#8490a5;">
                        Your guide to skills, careers and placements.
                    </p>
                </div>

                <button id="back-dashboard" style="
                    background:#596ce5;
                    color:white;
                    border:0;
                    padding:12px 20px;
                    border-radius:8px;
                    cursor:pointer;
                ">
                    ← Back to Dashboard
                </button>

            </div>

            <div style="
                max-width:900px;
                margin:auto;
                background:white;
                border-radius:14px;
                padding:20px;
                box-shadow:0 4px 20px rgba(0,0,0,0.05);
            ">

                <h2 style="color:#20283b;">
                    Welcome to StudentHub Career Mentor!
                </h2>

                <p style="color:#8490a5;">
                    Ask about programming, career planning, internships,
                    resumes and interview preparation.
                </p>

                <div id="guest-usage" style="
                    padding:12px 15px;
                    background:#eef2ff;
                    color:#3446a8;
                    border-radius:8px;
                    margin:15px 0;
                    font-size:14px;
                ">
                    Checking your free messages...
                </div>

                <div id="chat-messages" style="
                    height:430px;
                    overflow-y:auto;
                    border:1px solid #e5e9f2;
                    border-radius:10px;
                    padding:15px;
                    margin:20px 0;
                ">

                    <div style="
                        background:#f1f3f8;
                        color:#20283b;
                        padding:15px;
                        border-radius:10px;
                        line-height:1.7;
                    ">
                        Hello! What would you like help with today?
                    </div>

                </div>

                <form id="mentor-form" style="
                    display:flex;
                    gap:10px;
                    flex-wrap:wrap;
                ">

                    <input
                        type="text"
                        id="mentor-input"
                        placeholder="Ask your career question..."
                        autocomplete="off"
                        required
                        maxlength="4000"
                        style="
                            flex:1;
                            min-width:180px;
                            padding:14px;
                            border:1px solid #dce1ed;
                            border-radius:8px;
                            outline:none;
                        "
                    >

                    <button type="submit" id="mentor-send" style="
                        padding:12px 22px;
                        background:#596ce5;
                        color:white;
                        border:0;
                        border-radius:8px;
                        cursor:pointer;
                    ">
                        Send
                    </button>

                </form>

                <div id="mentor-auth-links" style="
                    display:none;
                    margin-top:18px;
                    padding:16px;
                    background:#fff7e8;
                    border-radius:10px;
                    color:#7a4b00;
                    line-height:1.8;
                ">
                    <strong>Your 3 free AI messages are used.</strong>

                    <p style="margin:6px 0;">
                        Register or log in to continue using AI Career Mentor.
                    </p>

                    <a href="register.html" style="
                        color:#3867e8;
                        font-weight:bold;
                        text-decoration:none;
                    ">Create an account</a>

                    <span> | </span>

                    <a href="login.html" style="
                        color:#3867e8;
                        font-weight:bold;
                        text-decoration:none;
                    ">Login</a>
                </div>

            </div>

        </section>
    `;

    document.getElementById("back-dashboard")
        .addEventListener("click", showDashboard);

    setupMentorChat();
}


// ==========================================
// CHAT MESSAGE DISPLAY
// ==========================================

function addChatMessage(message, sender) {

    const chatMessages = document.getElementById("chat-messages");

    if (!chatMessages) return null;

    const messageElement = document.createElement("div");

    messageElement.style.padding = "14px";
    messageElement.style.marginBottom = "12px";
    messageElement.style.borderRadius = "10px";
    messageElement.style.maxWidth = "85%";
    messageElement.style.lineHeight = "1.7";
    messageElement.style.overflowWrap = "anywhere";

    if (sender === "user") {

        messageElement.style.background = "#e8edff";
        messageElement.style.color = "#20283b";
        messageElement.style.marginLeft = "auto";

        messageElement.textContent = message;

    } else {

        messageElement.style.background = "#f1f3f8";
        messageElement.style.color = "#20283b";

        messageElement.innerHTML = formatMarkdown(message);
    }

    chatMessages.appendChild(messageElement);

    chatMessages.scrollTop = chatMessages.scrollHeight;

    return messageElement;
}


// ==========================================
// GUEST MESSAGE STATUS
// ==========================================

function updateMentorUsage(data) {

    const usageBox = document.getElementById("guest-usage");
    const mentorInput = document.getElementById("mentor-input");
    const mentorSend = document.getElementById("mentor-send");
    const authLinks = document.getElementById("mentor-auth-links");

    if (!usageBox) return;

    if (data.logged_in) {

        usageBox.textContent =
            "You are logged in. Enjoy unlimited AI Career Mentor messages.";

        usageBox.style.background = "#e9f8ef";
        usageBox.style.color = "#18743a";

        if (mentorInput) mentorInput.disabled = false;
        if (mentorSend) mentorSend.disabled = false;

        if (authLinks) authLinks.style.display = "none";

        return;
    }

    const remaining = Number(data.remaining ?? 0);

    if (remaining <= 0) {

        usageBox.textContent = "Your 3 free AI messages have been used.";

        usageBox.style.background = "#fff0e8";
        usageBox.style.color = "#a34320";

        if (mentorInput) {
            mentorInput.disabled = true;
            mentorInput.placeholder = "Register or login to continue.";
        }

        if (mentorSend) mentorSend.disabled = true;

        if (authLinks) authLinks.style.display = "block";

        return;
    }

    usageBox.textContent =
        `Guest Mode: ${remaining} of 3 free AI messages remaining.`;

    usageBox.style.background = "#eef2ff";
    usageBox.style.color = "#3446a8";

    if (mentorInput) {
        mentorInput.disabled = false;
        mentorInput.placeholder = "Ask your career question...";
    }

    if (mentorSend) mentorSend.disabled = false;

    if (authLinks) authLinks.style.display = "none";
}


// ==========================================
// LOAD GUEST MESSAGE STATUS
// ==========================================

async function loadMentorUsage() {

    try {

        const response = await fetch(`${API_BASE}/api/chat-usage`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("Unable to check message allowance.");
        }

        const data = await response.json();

        updateMentorUsage(data);

    } catch (error) {

        console.error("Message usage error:", error);

        const usageBox = document.getElementById("guest-usage");

        if (usageBox) {
            usageBox.textContent =
                "Unable to check your free messages. Please check your backend connection.";
        }
    }
}


// ==========================================
// GEMINI CHAT CONNECTION
// ==========================================

function setupMentorChat() {

    const mentorForm = document.getElementById("mentor-form");
    const mentorInput = document.getElementById("mentor-input");
    const mentorSend = document.getElementById("mentor-send");

    const API_URL = `${API_BASE}/api/chat`;

    loadMentorUsage();

    mentorForm.addEventListener("submit", async function(event) {

        event.preventDefault();

        const userMessage = mentorInput.value.trim();

        if (!userMessage || mentorSend.disabled) return;

        addChatMessage(userMessage, "user");

        mentorInput.value = "";

        mentorSend.disabled = true;
        mentorInput.disabled = true;
        mentorSend.textContent = "Thinking...";

        const loadingMessage = addChatMessage(
            "Your Career Mentor is thinking...",
            "mentor"
        );

        try {

            const response = await fetch(API_URL, {

                method: "POST",

                credentials: "include",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    message: userMessage
                })

            });

            const data = await response.json();

            if (
                response.status === 403 &&
                data.code === "GUEST_LIMIT_REACHED"
            ) {

                if (loadingMessage) {
                    loadingMessage.textContent =
                        "You have used all 3 free AI messages. Please register or log in to continue.";
                }

                updateMentorUsage({
                    logged_in: false,
                    remaining: 0
                });

                return;
            }

            if (!response.ok) {
                throw new Error(
                    data.error || data.message || "Server error"
                );
            }

            if (loadingMessage) {
                loadingMessage.innerHTML = formatMarkdown(
                    data.reply || "No response received from Gemini."
                );
            }

            await loadMentorUsage();

        } catch (error) {

            if (loadingMessage) {
                loadingMessage.textContent =
                    "Unable to connect to your Career Mentor. " +
                    "Check that your Flask backend is running. " +
                    "Error: " + error.message;
            }

        } finally {

            mentorSend.textContent = "Send";

            await loadMentorUsage();

            mentorInput.focus();
        }

    });
}


// ==========================================
// OTHER TOOLS - PLACEHOLDER PAGES
// ==========================================

function openComingSoon(toolName) {

    const descriptions = {

        "Learn Skills": "A place to explore skills and follow learning lessons.",

        "Projects": "A place to plan, build and track your projects.",

        "Coding Practice": "A place to practise programming problems.",

        "DSA Preparation": "A place to learn data structures and algorithms.",

        "Aptitude": "A place to practise quantitative and logical reasoning.",

        "Soft Skills": "A place to improve communication and interview skills.",

        "Internships & Jobs": "A place to explore opportunities and track applications.",

        "Resume Builder": "A place to create and improve your resume.",

        "Portfolio Builder": "A place to organise and present your work.",

        "Settings": "Account and dashboard preferences will be managed here."

    };

    openWorkspace(
        toolName,
        descriptions[toolName] || "Your StudentHub workspace.",

        `
            <div style="
                background:white;
                padding:28px;
                border-radius:14px;
                text-align:center;
                box-shadow:0 4px 18px rgba(0,0,0,0.05);
            ">

                <div style="font-size:38px;margin-bottom:12px;">
                    🚀
                </div>

                <h2 style="color:#20283b;">
                    This workspace is planned
                </h2>

                <p style="color:#8490a5;line-height:1.7;">
                    The ${toolName} section has its own page now.
                    Its tools and features will be built in a later development step.
                </p>

            </div>
        `
    );
}


// ==========================================
// SIDEBAR NAVIGATION EVENTS
// ==========================================

navLinks.forEach(link => {

    link.addEventListener("click", function(event) {

        event.preventDefault();

        const toolName = this.textContent.trim();

        setActiveLink(this);

        if (toolName.includes("Dashboard")) {
            showDashboard();
            return;
        }

        if (toolName.includes("AI Career Mentor")) {
            openCareerMentor();
            return;
        }

        if (toolName.includes("Career Roadmaps")) {
            openCareerRoadmaps();
            return;
        }

        if (toolName.toLowerCase().includes("logout")) {
            logoutUser();
            return;
        }

        openComingSoon(toolName);

    });

});
