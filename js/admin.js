document.addEventListener('DOMContentLoaded', async function() {
    console.log('Admin panel script loaded (manual fill).');

    const adminContentPlaceholder = document.getElementById('adminContentPlaceholder');
    if (!adminContentPlaceholder) {
        console.error('Admin content placeholder not found!');
        return;
    }

    try {
        const authResponse = await fetch('/api/check-auth');
        if (!authResponse.ok) {
            throw new Error(`Auth check failed with status ${authResponse.status}`);
        }
        const authData = await authResponse.json();

        if (!authData.authenticated) {
            console.log('User not authenticated. Redirecting to login.');
            window.location.href = 'login.html?redirect=admin.html';
            return;
        }

        if (!authData.isAdmin) {
            console.warn('User is not an admin. Denying access to admin panel.');
            adminContentPlaceholder.innerHTML = 
                '<div class="alert alert-danger">Доступ запрещен. У вас нет прав администратора.</div>' +
                '<a href="index.html" class="btn btn-primary">Вернуться на главную</a>';
            
            const mainAdminHeader = document.querySelector('.admin-panel-content .d-flex.border-bottom');
            if(mainAdminHeader) mainAdminHeader.style.display = 'none';
            return;
        }

        console.log('Admin access granted for user:', authData.username);
        initializeAdminPanel(authData, adminContentPlaceholder);

    } catch (error) {
        console.error('Error during admin auth check or panel initialization:', error);
        adminContentPlaceholder.innerHTML = '<div class="alert alert-danger">Ошибка при загрузке панели администратора. Попробуйте позже.</div>';
    }
});

function initializeAdminPanel(adminUser, container) {
    container.innerHTML = `
        <h4>Добро пожаловать, ${adminUser.firstName || adminUser.username}!</h4>
        <nav>
            <div class="nav nav-tabs mb-3" id="admin-sections-nav" role="tablist">
                <!-- Навигационные элементы будут вставлены здесь -->
            </div>
        </nav>
        <div class="tab-content" id="admin-section-content">
            <!-- Содержимое вкладок будет вставлено здесь -->
        </div>
    `;
    loadAdminNavigationTabs(adminUser);
}

function loadAdminNavigationTabs(adminUser) {
    const navContainer = document.getElementById('admin-sections-nav');
    const contentContainer = document.getElementById('admin-section-content');
    if (!navContainer || !contentContainer) return;

    navContainer.innerHTML = ''; // Очищаем перед заполнением
    contentContainer.innerHTML = ''; // Очищаем перед заполнением

    const sections = [
        { id: 'generate-token', title: 'Генерация токенов', renderer: renderGenerateTokenSection },
        { id: 'manage-users', title: 'Управление пользователями', renderer: renderManageUsersSection }
    ];

    sections.forEach((section, index) => {
        // Создаем кнопку для вкладки
        const button = document.createElement('button');
        button.classList.add('nav-link');
        if (index === 0) button.classList.add('active');
        button.id = `nav-${section.id}-tab`;
        button.dataset.bsToggle = 'tab';
        button.dataset.bsTarget = `#tab-${section.id}-content`;
        button.type = 'button';
        button.role = 'tab';
        button.setAttribute('aria-controls', `tab-${section.id}-content`);
        button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
        button.textContent = section.title;
        navContainer.appendChild(button);

        // Создаем панель для контента вкладки
        const tabPane = document.createElement('div');
        tabPane.classList.add('tab-pane', 'fade');
        if (index === 0) tabPane.classList.add('show', 'active');
        tabPane.id = `tab-${section.id}-content`;
        tabPane.role = 'tabpanel';
        tabPane.setAttribute('aria-labelledby', `nav-${section.id}-tab`);
        contentContainer.appendChild(tabPane);

        // Вызываем функцию рендеринга для текущей секции
        if (typeof section.renderer === 'function') {
            section.renderer(tabPane, adminUser);
        }
    });
}

function renderGenerateTokenSection(container, adminUser) {
    container.innerHTML = `
        <h5>Генерация пригласительных токенов</h5>
        <form id="generateTokenForm" class="mt-3">
            <div class="row g-3 align-items-end">
                <div class="col-md-4">
                    <label for="expiresInHours" class="form-label">Срок действия (часы):</label>
                    <input type="number" class="form-control" id="expiresInHours" value="24" min="1">
                </div>
                <div class="col-md-auto">
                    <button type="submit" class="btn btn-primary">Сгенерировать токен</button>
                </div>
            </div>
        </form>
        <div id="generatedTokenArea" class="mt-4" style="display:none;">
            <h6>Сгенерированный токен:</h6>
            <div class="input-group">
                <input type="text" id="tokenValue" class="form-control" readonly>
                <button class="btn btn-outline-secondary" type="button" id="copyTokenBtn"><i class="bi bi-clipboard"></i> Копировать</button>
            </div>
            <small class="text-muted">Передайте этот токен новому пользователю для регистрации.</small>
        </div>
        <div id="tokenErrorArea" class="mt-3 alert alert-danger" style="display:none;" role="alert"></div>
    `;

    const generateTokenForm = container.querySelector('#generateTokenForm');
    const expiresInHoursInput = container.querySelector('#expiresInHours');
    const generatedTokenArea = container.querySelector('#generatedTokenArea');
    const tokenValueInput = container.querySelector('#tokenValue');
    const copyTokenBtn = container.querySelector('#copyTokenBtn');
    const tokenErrorArea = container.querySelector('#tokenErrorArea');

    generateTokenForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        tokenErrorArea.style.display = 'none';
        generatedTokenArea.style.display = 'none';
        const hours = parseInt(expiresInHoursInput.value) || 24;

        try {
            const response = await fetch('/api/enterprise/invitation-tokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expiresInHours: hours })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                tokenValueInput.value = data.invitationToken;
                generatedTokenArea.style.display = 'block';
            } else {
                tokenErrorArea.textContent = data.error || 'Ошибка генерации токена.';
                tokenErrorArea.style.display = 'block';
            }
        } catch (error) {
            console.error('Failed to generate token:', error);
            tokenErrorArea.textContent = 'Сетевая ошибка или ошибка сервера при генерации токена.';
            tokenErrorArea.style.display = 'block';
        }
    });

    copyTokenBtn.addEventListener('click', () => {
        tokenValueInput.select();
        document.execCommand('copy');
        // Можно добавить уведомление об успешном копировании
        copyTokenBtn.textContent = 'Скопировано!';
        setTimeout(() => { copyTokenBtn.innerHTML = '<i class="bi bi-clipboard"></i> Копировать'; }, 2000);
    });
}

function renderManageUsersSection(container, adminUser) {
    container.innerHTML = '<h5>Управление пользователями предприятия</h5><div id="userListContainer"><p>Загрузка списка пользователей...</p></div>';
    const userListContainer = container.querySelector('#userListContainer');

    async function fetchAndRenderUsers() {
        try {
            const response = await fetch('/api/enterprise/users');
            const data = await response.json();

            if (!response.ok || !data.success) {
                userListContainer.innerHTML = `<div class="alert alert-danger">Ошибка загрузки пользователей: ${data.error || 'Неизвестная ошибка'}</div>`;
                return;
            }

            if (!data.users || data.users.length === 0) {
                userListContainer.innerHTML = '<p>На вашем предприятии пока нет других пользователей.</p>';
                return;
            }

            let tableHtml = `
                <table class="table table-striped table-hover">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Имя пользователя</th>
                            <th>Email</th>
                            <th>Имя Фамилия</th>
                            <th>Дата регистрации</th>
                            <th>Администратор</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            data.users.forEach(user => {
                tableHtml += `
                    <tr>
                        <td>${user.userId}</td>
                        <td>${user.username}</td>
                        <td>${user.email}</td>
                        <td>${user.firstName || ''} ${user.lastName || ''}</td>
                        <td>${user.createdDate || 'N/A'}</td>
                        <td>${user.isAdmin ? '<span class="badge bg-success">Да</span>' : '<span class="badge bg-secondary">Нет</span>'}</td>
                        <td class="user-actions">`;
                
                if (user.userId !== adminUser.userId) {
                    tableHtml += `
                            <button class="btn btn-sm ${user.isAdmin ? 'btn-outline-warning' : 'btn-outline-success'} toggle-admin-btn me-1" 
                                    data-user-id="${user.userId}" 
                                    data-is-admin="${user.isAdmin}" title="${user.isAdmin ? 'Снять права администратора' : 'Сделать администратором'}">
                                <i class="bi ${user.isAdmin ? 'bi-person-dash' : 'bi-person-check'}"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger delete-user-btn" 
                                    data-user-id="${user.userId}" 
                                    data-username="${user.username}" title="Удалить пользователя">
                                <i class="bi bi-trash"></i>
                            </button>
                    `;
                } else {
                    tableHtml += '<small class="text-muted">Это вы</small>';
                }
                tableHtml += '</td></tr>';
            });

            tableHtml += '</tbody></table>';
            userListContainer.innerHTML = tableHtml;

            // Добавляем обработчики на кнопки изменения статуса админа
            userListContainer.querySelectorAll('.toggle-admin-btn').forEach(button => {
                button.addEventListener('click', async (event) => {
                    const targetButton = event.currentTarget;
                    const userIdToToggle = targetButton.dataset.userId;
                    const currentIsAdmin = targetButton.dataset.isAdmin === 'true';
                    const newIsAdmin = !currentIsAdmin;

                    if (confirm(`Вы уверены, что хотите ${newIsAdmin ? 'назначить администратором' : 'снять права администратора с'} пользователя ${targetButton.closest('tr').cells[1].textContent} (ID ${userIdToToggle})?`)) {
                        try {
                            const toggleResponse = await fetch(`/api/users/${userIdToToggle}/admin-status`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ isAdmin: newIsAdmin })
                            });
                            const toggleData = await toggleResponse.json();
                            if (toggleResponse.ok && toggleData.success) {
                                alert('Статус пользователя успешно изменен!');
                                fetchAndRenderUsers(); 
                            } else {
                                alert(`Ошибка: ${toggleData.error || 'Не удалось изменить статус пользователя.'}`);
                            }
                        } catch (err) {
                            console.error('Error toggling admin status:', err);
                            alert('Сетевая ошибка или ошибка сервера при изменении статуса.');
                        }
                    }
                });
            });

            // Добавляем обработчики на кнопки удаления пользователя
            userListContainer.querySelectorAll('.delete-user-btn').forEach(button => {
                button.addEventListener('click', async (event) => {
                    const targetButton = event.currentTarget;
                    const userIdToDelete = targetButton.dataset.userId;
                    const usernameToDelete = targetButton.dataset.username;

                    if (confirm(`Вы уверены, что хотите удалить пользователя ${usernameToDelete} (ID ${userIdToDelete})? Это действие необратимо.`)) {
                        try {
                            const deleteResponse = await fetch(`/api/users/${userIdToDelete}`, {
                                method: 'DELETE'
                            });
                            const deleteData = await deleteResponse.json();
                            if (deleteResponse.ok && deleteData.success) {
                                alert('Пользователь успешно удален!');
                                fetchAndRenderUsers(); // Обновляем список
                            } else {
                                alert(`Ошибка удаления: ${deleteData.error || 'Не удалось удалить пользователя.'}`);
                            }
                        } catch (err) {
                            console.error('Error deleting user:', err);
                            alert('Сетевая ошибка или ошибка сервера при удалении пользователя.');
                        }
                    }
                });
            });

        } catch (err) {
            console.error('Failed to fetch users:', err);
            userListContainer.innerHTML = '<div class="alert alert-danger">Сетевая ошибка или ошибка сервера при загрузке пользователей.</div>';
        }
    }

    fetchAndRenderUsers();
} 