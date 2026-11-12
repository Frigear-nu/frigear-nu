// The `verified` role requirement: met by users whose email is at `member.test`.
export default ({ user }: { user: { email?: string } }) => !!user.email?.endsWith('@member.test')
