---
slug: simplify-fp-crud
title: Simplifying a functional crud route
---

Most larger applications eventually solve three problems:
1. Raising errors that need to be handled.
2. Handling lists of data as opposed to single entities.
3. Optionally calling apis, depending on input.

To exemplify what issues may arrise when dealing with such problems, we will perform four operations for each input:
1. Parse the input ([as opposed to validating](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)).
2. Read data from a datasource.
3. Verify that all inputs occur in the datasource.
4. Update the data to the datasource.

## Domain
To exemplify the problem consider performing these operations for service managing users.
We will use some simple domain types to represent our problem.
```scala
final case class User(
  id: Int,
  name: String,
  age: Int
)

trait UserApi {
}

trait UserRepo {
  def get(id: NonEmptyList[Int]): IO[List[User]]
  def upsert(user: NonEmptyList[User]): IO[Unit]
}
```

## The initial implementation
```scala
def insertUser(user: User): IO[Unit] = 
```
