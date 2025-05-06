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
                // Отображаем имя и фамилию, если они есть, иначе username
                userName.textContent = (data.firstName && data.lastName) ? `${data.firstName} ${data.lastName}` : data.username;
            }

            // Добавление ссылки на админ-панель, если пользователь админ
            if (data.isAdmin) {
                const userDropdownMenu = userLoggedIn ? userLoggedIn.querySelector('.dropdown-menu') : null;
                if (userDropdownMenu && !userDropdownMenu.querySelector('a[href="admin.html"]')) { // Проверяем, что ссылка еще не добавлена
                    const adminLinkLi = document.createElement('li');
                    adminLinkLi.innerHTML = '<a class="dropdown-item" href="admin.html"><i class="bi bi-shield-lock"></i> Админ-панель</a>';
                    
                    // Вставляем перед разделителем или последним элементом (Выйти)
                    const divider = userDropdownMenu.querySelector('hr.dropdown-divider');
                    if (divider && divider.parentElement.tagName === 'LI') {
                        userDropdownMenu.insertBefore(adminLinkLi, divider.parentElement);
                    } else {
                        // Если разделителя нет или он не в LI, добавляем перед последним элементом (кнопкой Выйти)
                        const logoutLi = userDropdownMenu.querySelector('a#logoutBtn') ? userDropdownMenu.querySelector('a#logoutBtn').closest('li') : null;
                        if (logoutLi) {
                            userDropdownMenu.insertBefore(adminLinkLi, logoutLi);
                        } else {
                             userDropdownMenu.appendChild(adminLinkLi); // крайний случай
                        }
                    }
                }
            }

            return true;
        } else {
            if (userLoggedIn && userNotLoggedIn) {
                userLoggedIn.classList.add('d-none');
                userNotLoggedIn.classList.remove('d-none');
            }
            // Если мы на защищенной странице, перенаправляем на логин
            const protectedPages = ['inventory.html', 'add.html', 'profile.html', 'records.html', 'admin.html'];
            const currentPage = window.location.pathname.split('/').pop();
            if (protectedPages.includes(currentPage) && !data.authenticated) {
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
