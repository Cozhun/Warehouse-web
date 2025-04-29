// Проверка аутентификации
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        const userLoggedIn = document.getElementById('userLoggedIn');
        const userNotLoggedIn = document.getElementById('userNotLoggedIn');
        const userName = document.getElementById('userName');
        
        if (data.authenticated) {
            if (userLoggedIn && userNotLoggedIn) {
                userLoggedIn.classList.remove('d-none');
                userNotLoggedIn.classList.add('d-none');
                userName.textContent = data.username;
            }
            return true;
        } else {
            if (userLoggedIn && userNotLoggedIn) {
                userLoggedIn.classList.add('d-none');
                userNotLoggedIn.classList.remove('d-none');
            }
            // Если мы на защищенной странице, перенаправляем на логин
            const protectedPages = ['inventory.html', 'add.html', 'profile.html'];
            const currentPage = window.location.pathname.split('/').pop();
            if (protectedPages.includes(currentPage)) {
                window.location.href = 'login.html';
            }
            return false;
        }
    } catch (err) {
        console.error('Auth check error:', err);
        return false;
    }
}

// Обработчик выхода из системы
async function handleLogout(e) {
    if (e) e.preventDefault();
    
    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            window.location.href = 'login.html';
        }
    } catch (err) {
        console.error('Logout error:', err);
    }
}

// Добавляем обработчик для кнопки выхода
document.addEventListener('DOMContentLoaded', function() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Проверяем аутентификацию при загрузке страницы
    checkAuth();
});
