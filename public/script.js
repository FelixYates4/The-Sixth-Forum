document.addEventListener('DOMContentLoaded', function() {
    const postsContainer = document.getElementById('posts-container');
    const authContainer = document.getElementById('auth-container');
    const authModal = document.getElementById('authModal');
    const postModal = document.getElementById('postModal');
    const closeButtons = document.querySelectorAll('.close');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const postForm = document.getElementById('postForm');
    const postSubjectSelect = document.getElementById('postSubject');
    const subjectList = document.getElementById('subject-list');
    const createPostBtn = document.getElementById('createPostBtn');
    const sortButtons = document.querySelectorAll('.sort-btn');
    const searchInput = document.querySelector('.search-bar input');
    const searchButton = document.querySelector('.search-bar button');
    const loginTabBtn = document.querySelector('.tab-btn[data-tab="login"]');
    const signupTabBtn = document.querySelector('.tab-btn[data-tab="signup"]');
    const homeBtn = document.querySelector('.main-nav a[href="#"]');
    const activityBtn = document.getElementById('activityBtn');

    let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
    let subjects = [];
    let currentFilter = 'all';
    let currentSort = 'new';
    let showingUserActivity = false;

    initApp();

    loginForm.addEventListener('submit', handleLogin);
    signupForm.addEventListener('submit', handleSignup);
    postForm.addEventListener('submit', handlePostSubmit);
    createPostBtn.addEventListener('click', handleCreatePostClick);
    searchButton.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleSearch());
    loginTabBtn.addEventListener('click', () => switchAuthTab('login'));
    signupTabBtn.addEventListener('click', () => switchAuthTab('signup'));
    homeBtn.addEventListener('click', showHomePage);
    activityBtn.addEventListener('click', showUserActivity);
    closeButtons.forEach(btn => btn.addEventListener('click', closeAllModals));
    window.addEventListener('click', (e) => (e.target === authModal || e.target === postModal) && closeAllModals());
    sortButtons.forEach(btn => btn.addEventListener('click', () => {
        currentSort = btn.dataset.sort;
        sortButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadPosts();
    }));

    // Helper function to get authenticated headers
    function getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        // If currentUser exists, add the Authorization header
        if (currentUser) {
            // Encode the currentUser JSON object for the Authorization header
            headers['Authorization'] = `Bearer ${encodeURIComponent(JSON.stringify(currentUser))}`;
        }
        return headers;
    }

    async function initApp() {
        await loadSubjects();
        updateAuthUI();
        loadPosts();
    }

    function showHomePage(e) {
        e.preventDefault();
        showingUserActivity = false;
        homeBtn.classList.add('active');
        activityBtn.classList.remove('active');
        document.querySelector('.left-sidebar').style.display = 'block';
        document.querySelector('.post-sorting').style.display = 'flex';
        document.getElementById('createPostBtn').style.display = 'flex';
        document.querySelector('.posts-feed').classList.remove('activity-view');
        loadPosts();
    }

    async function showUserActivity(e) {
        e.preventDefault();
        if (!currentUser) return showAuthModal();
        showingUserActivity = true;
        homeBtn.classList.remove('active');
        activityBtn.classList.add('active');
        document.querySelector('.left-sidebar').style.display = 'none';
        document.querySelector('.post-sorting').style.display = 'none';
        document.getElementById('createPostBtn').style.display = 'none';
        document.querySelector('.posts-feed').classList.add('activity-view');

        try {
            postsContainer.innerHTML = '<div class="loading">Loading activity...</div>';
            const headers = getAuthHeaders(); // Use authenticated headers

            const [postsRes, repliesRes] = await Promise.all([
                // Fetch posts authored by the user
                fetch(`/api/posts?user=${encodeURIComponent(currentUser.username)}`, { headers }),
                // Fetch replies made by the user
                fetch(`/api/replies?user=${encodeURIComponent(currentUser.username)}`, { headers })
            ]);

            if (!postsRes.ok) throw new Error('Failed to load user posts');
            if (!repliesRes.ok) throw new Error('Failed to load user replies');

            const userPosts = await postsRes.json();
            const userReplies = await repliesRes.json();

            // Get unique posts that user has commented on
            const postIds = [...new Set(userReplies.map(r => r.post_id))];
            const commentedPosts = await Promise.all(
                postIds.map(id =>
                    fetch(`/api/posts/${encodeURIComponent(id)}`, { headers }) // Fetch individual posts, requiring auth
                        .then(r => r.ok ? r.json() : null)
                        .catch(() => null)
                )
            );

            // Filter out null responses and combine with user's own posts
            const validCommentedPosts = commentedPosts.filter(p => p !== null);
            const allPosts = [...userPosts, ...validCommentedPosts]
                .filter((p, i, a) => a.findIndex(pi => pi.id === p.id) === i); // Deduplicate posts

            renderPosts(allPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
        } catch (err) {
            console.error('Activity load error:', err);
            postsContainer.innerHTML = '<div class="error">Failed to load activity. Please try again.</div>';
        }
    }

    async function loadSubjects() {
        try {
            const res = await fetch('/api/subjects');
            if (!res.ok) throw new Error('Failed to load subjects');
            subjects = await res.json();
            populateSubjectDropdown();
            populateSubjectList();
        } catch (err) {
            console.error('Subjects load error:', err);
        }
    }

    function populateSubjectDropdown() {
        postSubjectSelect.innerHTML = '<option value="">Select a subject</option>';
        ['English', 'Mathematics', 'Science', 'Other'].forEach(name => {
            const subject = subjects.find(s => s.name === name);
            if (subject) {
                const option = document.createElement('option');
                option.value = subject.id;
                option.textContent = name;
                postSubjectSelect.appendChild(option);
            }
        });
    }

    function populateSubjectList() {
        subjectList.innerHTML = '<li><a href="#" data-subject="all" class="active">All</a></li>';
        ['English', 'Mathematics', 'Science', 'Other'].forEach(name => {
            const subject = subjects.find(s => s.name === name);
            if (subject) {
                const li = document.createElement('li');
                li.innerHTML = `<a href="#" data-subject="${subject.id}">${name}</a>`;
                subjectList.appendChild(li);
            }
        });

        subjectList.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') {
                e.preventDefault();
                currentFilter = e.target.dataset.subject || 'all';
                document.querySelectorAll('.subject-list a').forEach(a => a.classList.remove('active'));
                e.target.classList.add('active');
                loadPosts();
            }
        });
    }

    async function loadPosts() {
        try {
            postsContainer.innerHTML = '<div class="loading">Loading posts...</div>';
            const url = `/api/posts?sort=${encodeURIComponent(currentSort)}${currentFilter !== 'all' ? `&subject_id=${encodeURIComponent(currentFilter)}` : ''}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to load');
            const posts = await res.json();
            renderPosts(posts);
        } catch (err) {
            console.error('Posts load error:', err);
            postsContainer.innerHTML = '<div class="error">Failed to load posts. Please try again.</div>';
        }
    }

    async function renderPosts(posts) {
        postsContainer.innerHTML = posts.length ? '' : '<div class="no-posts">No posts found</div>';
        for (const post of posts) {
            const postEl = await createPostElement(post);
            postsContainer.appendChild(postEl);
        }
    }

    async function createPostElement(post) {
        const replies = await loadReplies(post.id);
        const subject = subjects.find(s => s.id === post.subject_id);
        // Use author_id from the post and currentUser.id for a more robust check
        const isCurrentUserPost = currentUser && post.author_id === currentUser.id;
        // Check currentUser.isAdmin (now provided by the server)
        const isAdmin = currentUser && currentUser.isAdmin;

        const postEl = document.createElement('div');
        postEl.className = 'post-card';
        postEl.innerHTML = `
            <div class="post-header">
                ${!showingUserActivity && subject ? `<span class="post-subject">${escapeHtml(subject.name)}</span>` : ''}
                <span class="post-author">${escapeHtml(post.author)}</span>
                <span class="post-time">${getTimeAgo(post.created_at)}</span>
                ${(isCurrentUserPost || isAdmin) ? `<button class="delete-post-btn" data-post-id="${post.id}"><i class="fas fa-trash"></i></button>` : ''}
            </div>
            <div class="post-content">
                <h3 class="post-title">${escapeHtml(post.title)}</h3>
                <p class="post-text">${escapeHtml(post.content)}</p>
            </div>
            <div class="post-actions">
                <button class="action-btn reply-btn">
                    <i class="fas fa-comment"></i>
                    <span>${replies.length} comments</span>
                </button>
            </div>
            <div class="replies-container" style="display:none;">
                <div class="reply-form">
                    <span class="reply-author">${currentUser ? escapeHtml(currentUser.username) : ''}</span>
                    <input type="text" class="reply-input" placeholder="What are your thoughts?">
                </div>
                <div class="replies-list"></div>
            </div>
        `;

        const repliesList = postEl.querySelector('.replies-list');
        replies.forEach(reply => repliesList.appendChild(createReplyElement(reply, post.id)));
        setupPostInteractions(postEl, post.id, replies.length);

        if (isCurrentUserPost || isAdmin) {
            const deleteButton = postEl.querySelector('.delete-post-btn');
            if (deleteButton) { // Ensure button exists before adding listener
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deletePost(post.id);
                });
            }
        }

        return postEl;
    }

    function createReplyElement(reply, postId) {
        // Use author_id from the reply and currentUser.id
        const isCurrentUserReply = currentUser && reply.author_id === currentUser.id;
        // Check currentUser.isAdmin
        const isAdmin = currentUser && currentUser.isAdmin;

        const replyEl = document.createElement('div');
        replyEl.className = 'reply-card';
        replyEl.innerHTML = `
            <div class="reply-content">
                <div class="reply-header">
                    <span class="reply-author">${escapeHtml(reply.author)}</span>
                    <span class="reply-time">${getTimeAgo(reply.created_at)}</span>
                    ${(isCurrentUserReply || isAdmin) ? `<button class="delete-reply-btn" data-reply-id="${reply.id}"><i class="fas fa-trash"></i></button>` : ''}
                </div>
                <p class="reply-text">${escapeHtml(reply.content)}</p>
            </div>
        `;

        if (isCurrentUserReply || isAdmin) {
            const deleteButton = replyEl.querySelector('.delete-reply-btn');
            if (deleteButton) { // Ensure button exists
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteReply(reply.id, postId);
                });
            }
        }

        return replyEl;
    }

    function setupPostInteractions(postEl, postId, replyCount) {
        const replyBtn = postEl.querySelector('.reply-btn');
        const repliesContainer = postEl.querySelector('.replies-container');
        const replyInput = postEl.querySelector('.reply-input');
        const replyCountSpan = postEl.querySelector('.reply-btn span');

        replyBtn.addEventListener('click', () => {
            if (!currentUser) {
                showAuthModal();
                return;
            }
            repliesContainer.style.display = repliesContainer.style.display === 'none' ? 'block' : 'none';
            if (repliesContainer.style.display === 'block') {
                replyInput.focus();
            }
        });

        replyInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter' && replyInput.value.trim() && currentUser) {
                try {
                    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/replies`, {
                        method: 'POST',
                        headers: getAuthHeaders(), // Use authenticated headers
                        body: JSON.stringify({
                            content: replyInput.value
                            // author and author_id are now provided by backend from currentUser
                        })
                    });
                    if (!res.ok) throw new Error('Failed to add reply');
                    const newReply = await res.json();
                    const repliesList = postEl.querySelector('.replies-list');
                    repliesList.appendChild(createReplyElement(newReply, postId)); // Pass full newReply object
                    replyInput.value = '';
                    replyCountSpan.textContent = `${replyCount + 1} comments`;
                } catch (err) {
                    console.error('Reply error:', err);
                    alert('Failed to add reply. Please log in.');
                }
            }
        });
    }

    async function deletePost(postId) {
        if (!currentUser) {
            showAuthModal();
            return;
        }
        if (!confirm('Are you sure you want to delete this post?')) return;
        try {
            const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
                method: 'DELETE',
                headers: getAuthHeaders() // Use authenticated headers
            });
            if (res.status === 403) {
                alert('You do not have permission to delete this post.');
                return;
            }
            if (!res.ok) throw new Error('Failed to delete post');
            showingUserActivity ? showUserActivity({ preventDefault: () => { } }) : loadPosts();
        } catch (err) {
            console.error('Delete post error:', err);
            alert('Failed to delete post. ' + (err.message || 'Please try again.'));
        }
    }

    async function deleteReply(replyId, postId) {
        if (!currentUser) {
            showAuthModal();
            return;
        }
        if (!confirm('Are you sure you want to delete this reply?')) return;
        try {
            const res = await fetch(`/api/replies/${encodeURIComponent(replyId)}`, {
                method: 'DELETE',
                headers: getAuthHeaders() // Use authenticated headers
            });
            if (res.status === 403) {
                alert('You do not have permission to delete this reply.');
                return;
            }
            if (!res.ok) throw new Error('Failed to delete reply');
            // Re-load posts to reflect the change, or just update the UI locally
            showingUserActivity ? showUserActivity({ preventDefault: () => { } }) : loadPosts();
        } catch (err) {
            console.error('Delete reply error:', err);
            alert('Failed to delete reply. ' + (err.message || 'Please try again.'));
        }
    }

    async function loadReplies(postId) {
        try {
            const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/replies`); // Replies don't need auth to *view*
            return res.ok ? await res.json() : [];
        } catch (err) {
            console.error('Load replies error:', err);
            return [];
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            alert('Please fill in all fields');
            return;
        }

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: getAuthHeaders(), // Content-Type is handled by getAuthHeaders
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Login failed');
            }

            currentUser = await res.json();
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateAuthUI();
            closeAllModals();
            loadPosts();
        } catch (err) {
            console.error('Login error:', err);
            alert(err.message || 'Login failed. Please check your credentials.');
        }
    }

    async function handleSignup(e) {
        e.preventDefault();
        const username = document.getElementById('signupUsername').value;
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;

        if (!username || !email || !password) {
            alert('Please fill in all fields');
            return;
        }

        if (username.length > 20) {
            alert('Username must be 20 characters or less');
            return;
        }

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: getAuthHeaders(), // Content-Type is handled by getAuthHeaders
                body: JSON.stringify({
                    username: username,
                    email: email,
                    password: password
                })
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Registration failed');
            }

            alert('Registration successful! Please log in.');
            switchAuthTab('login');
            signupForm.reset();
        } catch (err) {
            console.error('Registration error:', err);
            alert(err.message || 'Registration failed');
        }
    }

    function handleSearch() {
        const term = searchInput.value.trim();
        if (!term) return showingUserActivity ? showUserActivity({ preventDefault: () => { } }) : loadPosts();
        postsContainer.innerHTML = '<div class="loading">Searching...</div>';
        // Build search URL, including user parameter for activity view
        const searchUrl = `/api/posts?search=${encodeURIComponent(term)}${showingUserActivity && currentUser ? `&user=${encodeURIComponent(currentUser.username)}` : ''}`;

        fetch(searchUrl, { headers: getAuthHeaders() }) // Send auth header even for search if user is logged in
            .then(res => res.ok ? res.json() : [])
            .then(posts => renderPosts(posts))
            .catch(() => postsContainer.innerHTML = '<div class="error">Search failed</div>');
    }

    function handleCreatePostClick() {
        if (!currentUser) return showAuthModal();
        showPostModal();
    }

    async function handlePostSubmit(e) {
        e.preventDefault();
        const title = document.getElementById('postTitle').value;
        const content = document.getElementById('postContent').value;
        const subjectId = postSubjectSelect.value;

        if (!title || !content || !subjectId) {
            alert('Please fill in all fields');
            return;
        }

        try {
            const res = await fetch('/api/posts', {
                method: 'POST',
                headers: getAuthHeaders(), // Use authenticated headers
                body: JSON.stringify({
                    title: title,
                    content: content,
                    subject_id: subjectId
                    // author and author_id are now provided by backend from currentUser
                })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to create post');
            }

            closeAllModals();
            postForm.reset();
            showingUserActivity ? showUserActivity({ preventDefault: () => { } }) : loadPosts();
        } catch (err) {
            console.error('Post creation error:', err);
            alert(err.message || 'Failed to create post.');
        }
    }

    function updateAuthUI() {
        if (currentUser) {
            authContainer.innerHTML = `
                <div class="user-menu">
                    <span>${escapeHtml(currentUser.username)}</span>
                    <button id="logoutBtn">Logout</button>
                </div>
            `;
            document.getElementById('logoutBtn').addEventListener('click', logout);
        } else {
            authContainer.innerHTML = `
                <div id="auth-buttons">
                    <button class="btn-login">Log In</button>
                    <button class="btn-signup">Sign Up</button>
                </div>
            `;
            document.querySelector('.btn-login').addEventListener('click', showAuthModal);
            document.querySelector('.btn-signup').addEventListener('click', () => {
                showAuthModal();
                switchAuthTab('signup');
            });
        }
    }

    function logout() {
        currentUser = null;
        localStorage.removeItem('currentUser');
        updateAuthUI();
        loadPosts();
        alert('You have been logged out.'); // Provide feedback
    }

    function switchAuthTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        loginForm.style.display = tab === 'login' ? 'block' : 'none';
        signupForm.style.display = tab === 'signup' ? 'block' : 'none';
        if (tab === 'login') signupForm.reset();
        else loginForm.reset();
    }

    function showAuthModal() {
        authModal.style.display = 'flex';
        document.getElementById('loginUsername').focus();
        switchAuthTab('login');
    }

    function showPostModal() {
        postModal.style.display = 'flex';
        document.getElementById('postTitle').focus();
    }

    function closeAllModals() {
        authModal.style.display = 'none';
        postModal.style.display = 'none';
    }

    function getTimeAgo(timestamp) {
        const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});