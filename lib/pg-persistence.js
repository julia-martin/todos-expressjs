const { dbQuery } = require('./db-query');
const bcrypt = require('bcrypt');

module.exports = class PgPersistence {
  constructor(session) {
    this.username = session.username;
  }
  // Returns a Promise that resolves to `true` if `username` and `password`
  // combine to identify a legitimate application user, `false` if either the
  // `username` or `password` is invalid.
  async authenticate(username, password) {
    const FIND_HASHED_PASSWORD = "SELECT password FROM users " + "WHERE username = $1";
    let result = await dbQuery(FIND_HASHED_PASSWORD, username);
    if (result.rowCount === 0) return false;

    return bcrypt.compare(password, result.rows[0].password);
  }

  isDoneTodoList(todoList) {
    return todoList.todos.length > 0 && todoList.todos.every(todo => todo.done);
  }

  async sortedTodoLists() {
    const ALL_TODOLISTS = "SELECT * FROM todolists " + "WHERE username = $1" + "ORDER BY LOWER(title)";
    const ALL_TODOS = "SELECT * FROM todos WHERE username = $1";
    let resultTodoLists = await dbQuery(ALL_TODOLISTS, this.username);
    let resultTodos = dbQuery(ALL_TODOS, this.username);
    let resultBoth = await Promise.all([resultTodoLists, resultTodos]);

    let allTodoLists = resultBoth[0].rows;
    let allTodos = resultBoth[1].rows;
    if (!allTodoLists || !allTodos) return undefined;

    allTodoLists.forEach(todoList => {
      todoList.todos = allTodos.filter(todo => {
        return todoList.id === todo.todolist_id;
      });
    })

    return this._partitionTodoLists(todoLists);
  }

  async loadTodoList(todoListId) {
    const FIND_TODOLIST = "SELECT * FROM todolists WHERE id = $1 AND username = $2";
    const FIND_TODOS = "SELECT * FROM todos WHERE todolist_id = $1 AND username = $2";
    let resultTodoList = dbQuery(FIND_TODOLIST, todoListId, this.username);
    let resultTodos = dbQuery(FIND_TODOS, todoListId, this.username);
    let resultBoth = await Promise.all([resultTodoList, resultTodos]);

    let todoList = resultBoth[0].rows[0];
    if (!todoList) return undefined;
    todoList.todos = resultBoth[1].rows;
    return todoList;
  }

  async sortedTodos(todoList) {
    const SORTED_TODOS = "SELECT * FROM todos WHERE todolist_id = $1 AND username = $2 " +
    "ORDER BY done, LOWER(title)";
    let result = await dbQuery(SORTED_TODOS, todoList.id, this.username);
    return result.rows;
  }

  async toggleTodo(todoListId, todoId) {
    const TOGGLE_DONE = "UPDATE todos SET done = NOT done " + "WHERE todolist_id = $1 and id = $2 AND username = $3";
    let result = await dbQuery(TOGGLE_DONE, todoListId, todoId, this.username);
    return result.rowCount > 0;
  }

  async loadTodo(todoListId, todoId) {
    const FIND_TODO = "SELECT * FROM todos WHERE todolist_id = $1 AND id = $2 AND username = $3";
    let result = await dbQuery(FIND_TODO, todoListId, todoId, this.username);
    return result.rows[0];
  };

  async deleteTodo(todoListId, todoId) {
    const DELETE_TODO = "DELETE FROM todos " + "WHERE todolist_id = $1 AND id = $2 AND username = $3";
    let result = await dbQuery(DELETE_TODO, todoListId, todoId, this.username);
    return result.rowCount > 0;
  }

  async hasUndoneTodos(todoList) {
    return todoList.todos.some(todo => !todo.done);
  }

  async completeAllTodos(todoListId) {
    const COMPLETE_ALL = "UPDATE todos SET done = TRUE " +
    "WHERE todolist_id = $1 AND NOT done " +
    "AND username = $2";
    let result = await dbQuery(COMPLETE_ALL, todoListId, this.username);
    return result.rowCount > 0;
  }

  async addTodo(todoListId, title) {
    const ADD_TODO = "INSERT INTO todos (title, todolist_id) " +
    "VALUES ($1, $2, $3)";
    let result = await dbQuery(ADD_TODO, title, todoListId, this.username);
    return result.rowCount > 0;
  }

  async deleteTodoList(todoListId) {
    const DELETE_TODOLIST = "DELETE FROM todolists WHERE id = $1 AND username = $2";
    let result = await dbQuery(DELETE_TODOLIST, todoListId, this.username);
    return result.rowCount > 0;
  }

  async existsTodoListTitle(title) {
    const FIND_TODOLIST = "SELECT 1 FROM todolists WHERE title = $1 AND username = $2";
    let result = await dbQuery(FIND_TODOLIST, title, this.username);
    return result.rowCount > 0;
  }

  async editTodoListTitle(todoListId, title) {
    let EDIT_TITLE = "UPDATE todolists SET title = $1 " + "WHERE id = $2 AND username = $3";
    let result = await dbQuery(EDIT_TITLE, title, todoListId, this.username);
    return result.rowCount > 0;
  }

  async addTodoList(title) {
    let ADD_TODOLIST = "INSERT INTO todolists (title, username) VALUES ($1, $2)";
    try {
      let result = await dbQuery(ADD_TODOLIST, title, this.username);
      return result.rowCount > 0;
    } catch(error) {
      if (this.isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  isUniqueConstraintViolation(error) {
    return /duplicate key value violates unique constraint/.test(String(error));
  }

  _partitionTodoLists(todoLists) {
    let undone = [];
    let done = [];
    todoLists.forEach(todoList => {
      if (this.isDoneTodoList(todoList)) {
        done.push(todoList);
      } else {
        undone.push(todoList);
      }
    });
    return undone.concat(done);
  }


};