export const isAdmin = defineAbility(user => user.role === 'admin')

export const editPost = defineAbility((user, post: { userId: number }) =>
  user.id === post.userId || user.role === 'admin' || deny({ message: 'Not your post' }))
