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
  
    let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
    let subjects = [];
    let currentFilter = 'all';
    let currentSort = 'new';
  
    initApp();
  
    loginForm.addEventListener('submit', handleLogin);
    signupForm.addEventListener('submit', handleSignup);
    postForm.addEventListener('submit', handlePostSubmit);
    createPostBtn.addEventListener('click', handleCreatePostClick);
    
    closeButtons.forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });
  
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeAllModals();
      }
    });
  
    async function initApp() {
      await loadSubjects();
      updateAuthUI();
      loadPosts();
    }
  
    async function loadSubjects() {
      try {
        const response = await fetch('/api/subjects');
        if (!response.ok) throw new Error('Failed to load subjects');
        subjects = await response.json();
        populateSubjectDropdown();
        populateSubjectList();
      } catch (error) {
        console.error('Error loading subjects:', error);
      }
    }
  
    function populateSubjectDropdown() {
      postSubjectSelect.innerHTML = '<option value="">Select a subject</option>';
      subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject.id;
        option.textContent = subject.name;
        postSubjectSelect.appendChild(option);
      });
    }
  
    function populateSubjectList() {
      const allLink = subjectList.querySelector('a[data-subject="all"]').parentNode;
      subjectList.innerHTML = '';
      subjectList.appendChild(allLink);
      
      subjects.forEach(subject => {
        const li = document.createElement('li');
        li.innerHTML = `<a href="#" data-subject="${subject.id}">${subject.name}</a>`;
        li.addEventListener('click', (e) => {
          e.preventDefault();
          currentFilter = subject.id;
          document.querySelectorAll('.subject-list a').forEach(a => a.classList.remove('active'));
          e.target.classList.add('active');
          loadPosts();
        });
        subjectList.appendChild(li);
      });
    }
  
    async function loadPosts() {
      try {
        postsContainer.innerHTML = '<div class="loading">Loading posts...</div>';
        
        let url = `/api/posts?sort=${currentSort}`;
        if (currentFilter !== 'all') {
          url += `&subject_id=${currentFilter}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load posts');
        
        const posts = await response.json();
        renderPosts(posts);
      } catch (error) {
        console.error('Error loading posts:', error);
        postsContainer.innerHTML = '<div class="error">Failed to load posts</div>';
      }
    }
  
    async function renderPosts(posts) {
      postsContainer.innerHTML = '';
      
      if (posts.length === 0) {
        postsContainer.innerHTML = '<div class="no-posts">No posts found</div>';
        return;
      }
      
      for (const post of posts) {
        const postElement = await createPostElement(post);
        postsContainer.appendChild(postElement);
      }
    }
  
    async function createPostElement(post) {
      const postElement = document.createElement('div');
      postElement.className = 'post-card';
      
      const replies = await loadReplies(post.id);
      const timeAgo = getTimeAgo(post.created_at);
      const subject = subjects.find(s => s.id === post.subject_id);
      
      postElement.innerHTML = `
        <div class="post-header">
          ${subject ? `<span class="post-subject">${subject.name}</span>` : ''}
          <span class="post-author">Posted by u/${post.author}</span>
          <span class="post-time">${timeAgo}</span>
        </div>
        <div class="post-content">
          <h3 class="post-title">${post.title}</h3>
          <p class="post-text">${post.content}</p>
        </div>
        <div class="post-actions">
          <button class="action-btn reply-btn">
            <i class="fas fa-comment"></i>
            <span>${replies.length} comments</span>
          </button>
        </div>
        <div class="replies-container" style="display:none;">
          <div class="reply-form">
            <div class="user-avatar-small">
              <i class="fas fa-user"></i>
            </div>
            <input type="text" class="reply-input" placeholder="What are your thoughts?">
          </div>
          <div class="replies-list"></div>
        </div>
      `;
      
      const repliesList = postElement.querySelector('.replies-list');
      replies.forEach(reply => {
        repliesList.appendChild(createReplyElement(reply));
      });
      
      setupPostInteractions(postElement, post.id, replies.length);
      return postElement;
    }
  
    function setupPostInteractions(postElement, postId, replyCount) {
      const replyBtn = postElement.querySelector('.reply-btn');
      const repliesContainer = postElement.querySelector('.replies-container');
      const replyInput = postElement.querySelector('.reply-input');
      const replyCountSpan = postElement.querySelector('.reply-btn span');
      
      replyBtn.addEventListener('click', () => {
        repliesContainer.style.display = repliesContainer.style.display === 'none' ? 'block' : 'none';
      });
      
      replyInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && replyInput.value.trim()) {
          if (!currentUser) {
            showAuthModal();
            return;
          }
          
          try {
            const response = await fetch(`/api/posts/${postId}/replies`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: replyInput.value,
                author: currentUser.username
              })
            });
            
            if (!response.ok) throw new Error('Failed to create reply');
            
            const newReply = await response.json();
            const repliesList = postElement.querySelector('.replies-list');
            
            repliesList.appendChild(createReplyElement({
              ...newReply,
              content: replyInput.value,
              author: currentUser.username,
              created_at: new Date().toISOString()
            }));
            
            replyInput.value = '';
            replyCountSpan.textContent = `${replyCount + 1} comments`;
          } catch (error) {
            console.error('Error creating reply:', error);
          }
        }
      });
    }
  
    async function loadReplies(postId) {
      try {
        const response = await fetch(`/api/posts/${postId}/replies`);
        if (!response.ok) throw new Error('Failed to load replies');
        return await response.json();
      } catch (error) {
        console.error('Error loading replies:', error);
        return [];
      }
    }
  
    function createReplyElement(reply) {
      const replyElement = document.createElement('div');
      replyElement.className = 'reply-card';
      const timeAgo = getTimeAgo(reply.created_at);
      
      replyElement.innerHTML = `
        <div class="user-avatar-small">
          <i class="fas fa-user"></i>
        </div>
        <div class="reply-content">
          <div class="reply-author">
            u/${reply.author}
            <span class="reply-time">${timeAgo}</span>
          </div>
          <p class="reply-text">${reply.content}</p>
        </div>
      `;
      
      return replyElement;
    }
  
    async function handleLogin(e) {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value;
      const password = document.getElementById('loginPassword').value;
      
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Login failed');
        }
        
        currentUser = await response.json();
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateAuthUI();
        closeAllModals();
        loadPosts();
      } catch (error) {
        console.error('Login error:', error);
        alert(error.message);
      }
    }
  
    async function handleSignup(e) {
      e.preventDefault();
      const username = document.getElementById('signupUsername').value;
      const email = document.getElementById('signupEmail').value;
      const password = document.getElementById('signupPassword').value;
      
      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Registration failed');
        }
        
        alert('Registration successful! Please log in.');
        switchAuthTab('login');
      } catch (error) {
        console.error('Signup error:', error);
        alert(error.message);
      }
    }
  
    function handleCreatePostClick() {
      if (!currentUser) {
        showAuthModal();
        return;
      }
      showPostModal();
    }
  
    async function handlePostSubmit(e) {
      e.preventDefault();
      const title = document.getElementById('postTitle').value;
      const content = document.getElementById('postContent').value;
      const subjectId = postSubjectSelect.value;
      
      if (!subjectId) {
        alert('Please select a subject');
        return;
      }
      
      try {
        const response = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            title, 
            content,
            author: currentUser.username,
            subject_id: subjectId
          })
        });
        
        if (!response.ok) throw new Error('Failed to create post');
        
        loadPosts();
        closeAllModals();
        postForm.reset();
      } catch (error) {
        console.error('Error creating post:', error);
        alert('Failed to create post');
      }
    }
  
    function updateAuthUI() {
      if (currentUser) {
        authContainer.innerHTML = `
          <div class="user-menu">
            <div class="user-avatar">${currentUser.username.charAt(0).toUpperCase()}</div>
            <span>${currentUser.username}</span>
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
    }
  
    function switchAuthTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
      });
      
      loginForm.style.display = tab === 'login' ? 'block' : 'none';
      signupForm.style.display = tab === 'signup' ? 'block' : 'none';
    }
  
    function showAuthModal() {
      authModal.style.display = 'flex';
      switchAuthTab('login');
    }
  
    function showPostModal() {
      postModal.style.display = 'flex';
    }
  
    function closeAllModals() {
      authModal.style.display = 'none';
      postModal.style.display = 'none';
    }
  
    function getTimeAgo(timestamp) {
      const now = new Date();
      const postDate = new Date(timestamp);
      const diff = now - postDate;
      
      const minutes = Math.floor(diff / (1000 * 60));
      if (minutes < 60) return `${minutes}m ago`;
      
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    }
  });